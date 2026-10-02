The native compatibility oracle is development tooling with a JSONL interface;
it does not build or load WASM. Normal SDK builds do not enable its feature,
and JavaScript consumers do not need Rust.

```sh
cargo build --locked -p idkit-core --bin idkit-conformance --features conformance
target/debug/idkit-conformance < cases.jsonl
cargo test --locked -p idkit-core --features conformance
```

Every nonempty input line is an object with `op` and its inputs. Every output
line is `{ "ok": true, "value": ... }` or
`{ "ok": false, "error": { "kind": "...", "message": "..." } }`.
Errors do not terminate the stream. Error kinds are comparable; HTTP/serde
diagnostic prose is not a compatibility promise.

Integers above the JavaScript safe integer range are encoded as
`{"$u64":"18446744073709551615"}` (or `$i64` for signed values). The runner
accepts the same tags in its inputs. Harnesses must preserve these tags or use
lossless integers, rather than rounding the values through JavaScript numbers.
Hex byte inputs have no `0x` prefix unless their field represents a protocol
field element (`nonce`).

| Operation           | Inputs                                                                        | Value                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `manifest`          | none                                                                          | Enum values, schema IDs, preset and response samples, minimum/full result shapes, locked protocol dependency version |
| `hash_to_field`     | `input_hex`                                                                   | Padded `0x` hash string                                                                                              |
| `hash_signal`       | `signal`: string or `{bytes_hex}`                                             | Padded `0x` hash string                                                                                              |
| `encrypt`           | `key_hex`, `iv_hex`, `plaintext_hex`                                          | `{ciphertext_hex}` including appended tag                                                                            |
| `decrypt`           | `key_hex`, `iv_hex`, `ciphertext_hex`                                         | `{plaintext_hex}`                                                                                                    |
| `base64_encode`     | `input_hex`                                                                   | Standard padded base64 string                                                                                        |
| `base64_decode`     | `value`                                                                       | `{bytes_hex}`                                                                                                        |
| `invite_derive`     | `code`                                                                        | `{index,key_hex}`; intentionally does not parse/normalize first                                                      |
| `invite_parse`      | `code`                                                                        | Canonical code or invalid-configuration failure                                                                      |
| `invite_generate`   | `entropy_hex` (exactly five bytes)                                            | Canonical code including the production checksum                                                                     |
| `constraints`       | `constraints`                                                                 | `{proof_requests,constraints}` from top-level conversion                                                             |
| `compile`           | `config`, `selection`, `now`, `request_id`, optional `native`, `native_v1`    | `{payload,signal_hashes,legacy_signal_hash}`                                                                         |
| `create`            | `config`, `selection`, optional `now`, optional `invite_code` boolean         | `{connector_uri,request_id,expires_at?,debug_report}` from a real bridge HTTP creation                               |
| `create_live`       | Same as `create`                                                              | Same creation result; retains the actual connection for subsequent lines                                             |
| `poll_live`         | none; requires a successful `create_live` in this process                     | `{status,debug_report}` from the retained connection's actual HTTP poll                                              |
| `response`          | `response`, optional `context`                                                | Bridge status with confirmed result or failed error code                                                             |
| `poll`              | Poll `response` (`status`, optional encrypted `response`), optional `context` | Status after actual bridge envelope parsing, decrypting and result conversion                                        |
| `proof_response`    | `response`, `context`                                                         | Direct protocol-response-to-public-result conversion                                                                 |
| `connect_url`       | optional `context`                                                            | Connector URL                                                                                                        |
| `app_error`         | `code`                                                                        | Normalized production AppError code                                                                                  |
| `bridge_url`        | `app_id`, `url`                                                               | Validated original URL string                                                                                        |
| `signature_message` | `nonce`, `created_at`, `expires_at`, optional `action`                        | `{message_hex}`                                                                                                      |
| `sign`              | Same as `signature_message`, plus `key_hex`                                   | `{sig,nonce,created_at,expires_at}`                                                                                  |

`compile.config.kind` is `request`, `create_session`, or `prove_session`. All
three require `app_id`, `package_name`, `package_version`, `rp_context`.
`request` requires `action`; `prove_session` requires `session_id`.
Other config fields mirror the existing JS builder. Optional presence/legacy
booleans default to false. `selection` contains either `preset` or
`constraints`, in the existing serialized SDK shape. `native: true` selects
the full native payload; `native_v1: true` selects the legacy native payload
and requires a preset. `now` is Unix seconds and `request_id` is the injected
protocol request ID. The bridge-assigned ID is separate connection state.

`create` calls the actual production HTTP creation flow, including invite-code
collision retries and echoed-ID validation. Use a synthetic local bridge with
a staging app ID. It uses real secure entropy; `now` only controls input RP
context validation. Generated protocol request IDs, debug timestamps and invite
expiry are real production values. Compare captured decrypted request objects
structurally, normalizing the generated `proof_request.id`. The HTTP suite also
explicitly normalizes SDK-specific `package_version`; it checks invite expiry
against the current clock instead of ignoring arbitrary timestamp fields. The
connector URL contains the normal ephemeral decryption key; use synthetic test
requests only. The JSONL process blocks until the operation finishes, so a test
host serving the bridge should spawn it asynchronously.

The binary keeps one `Runner` for its entire stdin stream. `create_live` clears
any prior live connection before attempting creation, then retains the new
production connection and runtime on success. Send `{"op":"poll_live"}` on a
later line to poll it; no test-owned key or signal cache is reconstructed.
Polling errors leave the connection available for another poll. Calling
`poll_live` without a live connection returns `invalid_configuration`. Other
operations remain stateless and do not replace the live connection; `create`
alone does not establish one. Each response line is flushed immediately.

`response.context` accepts `nonce`, `action`, `action_description`,
`environment`, `signal_hashes`, `legacy_signal_hash`, and
`require_user_presence`. `connect_url.context` additionally uses `key_hex`,
`request_id`, `app_id`, `bridge_url`, `override_connect_base_url`, `return_to`,
and `invite_code`. Defaults are deterministic test placeholders. The direct
`proof_response` context requires `nonce`, accepts the same optional metadata
and signal hashes, and accepts `identity_attested` and
`user_presence_completed` (it does not perform bridge presence enforcement).

For raw JSON parser boundaries, `response` and `poll` accept `response_hex`
instead of `response`. This sends exact bytes to the production serde response
types, preserving duplicate keys and malformed UTF-8 that an intermediate JSON
value would discard. The `poll` parsing seam reports `json_error` directly;
live HTTP polling wraps outer JSON deserialization errors as `http_error`.

The request config mapper was extracted from the existing WASM adapter. The
production builder and oracle share preset expansion, payload construction,
clock validation, response parsing, claims conversion and connector formatting.
The connection fixture factory only supplies state; it does not emulate these
operations. This deliberately preserves differences between the JS adapter's
contract and separate FFI wrapper defaults.

The `adapter/*` fixtures explicitly cover omitted/true/false presence and legacy
flags, preset overrides, session legacy suppression, environment normalization,
and null versus empty optional strings. Unknown environment strings retain the
JS adapter's production fallback; these runtime boundary fixtures do not widen
the public TypeScript input declarations or change the FFI contract.

`manifest` serializes typed Rust samples, including populated proof and session
nullifier arrays. `public-contract.ts` checks exported TypeScript enums,
response field types and optionality, aggregate result fields, and integrity
bundle fields against those samples. It preserves the narrower public result
union and the existing optional V3 `signal_hash` declaration. Run
`pnpm test:conformance` to compare the live oracle and then type-check these
assertions; Vitest alone does not enforce TypeScript assertions. An explicit
`IDKIT_CONFORMANCE_UPDATE=1` refresh first compares new Rust outputs with JS
before replacing the retained corpus and manifest; review that diff.

Compare raw AES vectors byte-for-byte with identical key, nonce and plaintext
bytes. Compare full decrypted request JSON structurally while preserving array
order, omitted versus null fields, types and cryptographic strings. Property
order is not a protocol-wide canonical encoding. The manifest and curated
shapes detect covered changes, but are not a complete schema or proof of
equivalence. CI should record the repository revision and corpus seed alongside
the manifest and execute the current native runner, not only stale fixtures.
