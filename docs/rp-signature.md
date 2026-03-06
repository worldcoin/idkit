# RP Signature Generation Spec

This document describes protocol-compatible RP signature generation for IDKit integrations, so teams can implement the same logic in any backend language/framework.

It is based on:
- `rust/core/src/rp_signature.rs`
- `js/packages/core/src/lib/signing.ts`
- `js/packages/core/src/__tests__/pure-crypto.test.ts`
- `world-id-protocol/crates/primitives/src/rp.rs`

This spec covers `rp_context` signing fields used by `IDKit.request(...)`:
- `nonce`
- `created_at`
- `expires_at`
- `signature`

## Inputs And Outputs

Input parameters:
- `signing_key_hex`: 32-byte secp256k1 private key, hex encoded (`0x` prefix optional)
- `action`: accepted for API compatibility, currently not used in the signature payload
- `ttl_seconds`: optional, defaults to `300` (5 minutes)

Output object:
- `sig`: `0x`-prefixed 65-byte signature (`r || s || v`)
- `nonce`: `0x`-prefixed 32-byte field element
- `created_at`: unix time in seconds
- `expires_at`: unix time in seconds

Protocol constant:
- `RP_SIGNATURE_MSG_VERSION = 0x01` (prepended to the message)

## Normative Algorithm

1. Parse and validate signing key.
2. Generate 32 random bytes.
3. Convert random bytes into a field element:
   - `nonce = keccak256(random_bytes) >> 8`
   - encode as 32 bytes (big-endian), hex with `0x` prefix for transport.
4. Set `created_at = unix_now_seconds`.
5. Set `expires_at = created_at + (ttl_seconds or 300)`.
6. Build signing message (49 bytes):
   - `message = version_u8(1) || nonce_bytes(32) || created_at_u64_be(8) || expires_at_u64_be(8)`
   - `version_u8` is currently `0x01`
7. Hash message:
   - `digest = keccak256(message)`
8. Sign digest with ECDSA secp256k1 recoverable signature.
9. Encode final signature:
   - first 64 bytes: compact `r || s`
   - last byte: `v = recovery_id + 27`
   - transport format: `0x` + 130 hex chars

Important compatibility note:
- `action` is currently **not** part of the signed message. Do not include it in `message`.

## Pseudocode

```text
function hash_to_field(input_bytes[32]) -> bytes32:
    h = keccak256(input_bytes)              // 32 bytes
    n = big_endian_uint256(h)
    n = n >> 8
    return uint256_to_32bytes_be(n)
```

```text
function compute_rp_signature_message(nonce_bytes32, created_at_u64, expires_at_u64) -> bytes49:
    msg = new bytes(49)
    msg[0]      = 0x01
    msg[1..32]  = nonce_bytes32
    msg[33..40] = u64_to_be_bytes(created_at_u64)
    msg[41..48] = u64_to_be_bytes(expires_at_u64)
    return msg
```

```text
function sign_request(signing_key_hex, action, ttl_seconds = 300):
    key = parse_hex_32_bytes(signing_key_hex)    // allow optional 0x

    random = crypto_random_bytes(32)
    nonce_bytes = hash_to_field(random)

    created_at = unix_time_seconds()
    expires_at = created_at + ttl_seconds

    msg = compute_rp_signature_message(nonce_bytes, created_at, expires_at)
    digest = keccak256(msg)

    (r, s, recid) = ecdsa_secp256k1_sign_recoverable(key, digest)

    sig65 = concat(r, s, byte(recid + 27))

    return {
        sig: "0x" + hex(sig65),
        nonce: "0x" + hex(nonce_bytes),
        created_at: created_at,
        expires_at: expires_at
    }
```

## Transport Shape (Backend -> Frontend)

Use snake_case field names when returning your backend response:

```json
{
  "sig": "0x<65-byte-signature-hex>",
  "nonce": "0x<32-byte-field-element-hex>",
  "created_at": 1700000000,
  "expires_at": 1700000300
}
```

## Reference Test Vectors

These vectors combine:
- Existing hash vectors from `js/packages/core/src/__tests__/pure-crypto.test.ts`
- Versioned RP message format from `world-id-protocol/crates/primitives/src/rp.rs`

### 1) `hash_to_field` / `hashSignal` vectors

`""` (empty string) ->
`0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4`

`"test_signal"` ->
`0x00c1636e0a961a3045054c4d61374422c31a95846b8442f0927ad2ff1d6112ed`

`[0x01, 0x02, 0x03]` ->
`0x00f1885eda54b7a053318cd41e2093220dab15d65381b1157a3633a83bfd5c92`

`"0x68656c6c6f"` (hex for `"hello"`) ->
`0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea`

### 2) Message-format vector

Given:
- `nonce = 0x00f1885eda54b7a053318cd41e2093220dab15d65381b1157a3633a83bfd5c92`
- `created_at = 1700000000`
- `expires_at = 1700000300`

`compute_rp_signature_message(...)` must produce this 49-byte hex payload:

`0100f1885eda54b7a053318cd41e2093220dab15d65381b1157a3633a83bfd5c92000000006553f100000000006553f22c`

With a small nonce (to verify leading-zero handling), given:
- `nonce = 0x0000000000000000000000000000000000000000000000000000000000000001`
- `created_at = 1000`
- `expires_at = 2000`

`compute_rp_signature_message(...)` must produce:

`01000000000000000000000000000000000000000000000000000000000000000100000000000003e800000000000007d0`

### 3) Validation checks

- Signature format: `^0x[0-9a-f]{130}$` (65 bytes)
- Nonce format: `^0x[0-9a-f]{64}$` (32 bytes)
- Nonce leading byte is `00` (field-element reduction behavior)
- Message length is always `49` bytes (`1 + 32 + 8 + 8`)
- Message version byte is always `0x01` (at index `0`)
- `v` is either `27` or `28`
- Default TTL is `300`
- Custom TTL works (example test uses `600`)
- Keys with or without `0x` are accepted
- Invalid hex keys and wrong-length keys are rejected
