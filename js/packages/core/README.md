# @worldcoin/idkit-core

World ID verification SDK for JavaScript/TypeScript, implemented in portable
JavaScript and tested against the native Rust core. No WASM binary, loader or
initialization step is required.

## Installation

```bash
npm install @worldcoin/idkit-core
```

## Runtimes and dependencies

The package supports browsers and Node.js 18+ through CommonJS and ES module
exports. React Native apps can use core directly or the DOM-free hooks from
[`@worldcoin/idkit/hooks`](../react/README.md#react-native-and-headless-react).
The runtime needs `fetch`, timers, `AbortController`, BigInt and cryptographically
secure randomness. Node's package entry supplies secure randomness without
modifying `globalThis.crypto`. Browser environments normally provide it through
`crypto.getRandomValues`.

Expo SDK 57 apps can install `expo-crypto` and import from
`@worldcoin/idkit-core/expo` (or `@worldcoin/idkit/expo` for React hooks) to
provide secure randomness automatically. Ordinary imports do not load Expo.

For a host without those capabilities, configure the missing providers before
creating requests:

```typescript
import { configureIDKitRuntime } from "@worldcoin/idkit-core";

configureIDKitRuntime({
  getRandomValues: (bytes) => secureRandomProvider.getRandomValues(bytes),
  fetch: hostFetch,
});
```

Both options are optional; omitted options use the host defaults. Each call
replaces the configuration, and `configureIDKitRuntime({})` restores the defaults.
The random provider must fill and return the supplied `Uint8Array` using secure
entropy. The SDK fails if no secure provider is available. This configuration
applies to client requests; generate RP signatures on your backend.

Cryptographic primitives use `@noble/ciphers` and `@noble/hashes`; encodings use
`@scure/base` and `@stablelib/utf8`. A bundled `whatwg-url` parser preserves URL
behavior across hosts, including hosts with incomplete URL or UTF-8 globals.
`@worldcoin/idkit-server` provides the signing helpers. These are JavaScript
dependencies; the portable entry does not import Node built-ins. See the
[development commands](../../../README.md#javascript-development) for compatibility checks.

## Script Tag / CDN

The package also publishes a browser global build at
`dist/idkit.global.js`. CDN package roots use that file via the `unpkg` and
`jsdelivr` fields:

```html
<script src="https://cdn.jsdelivr.net/npm/@worldcoin/idkit-core"></script>
```

The script exposes the client namespace as `window.IDKit`. It includes
`IDKit.request`, `IDKit.requestWithInviteCode`, `IDKit.createSession`,
`IDKit.proveSession`, `IDKit.CredentialRequest`, `IDKit.any`, `IDKit.all`,
`IDKit.enumerate`, the credential helpers (`proofOfHuman`, `passport`,
`mnc`, `identityCheck`, `selfieCheck`), and the legacy migration presets.

The browser build contains its JavaScript dependencies and makes no WASM asset
requests. RP signing is intentionally not exposed on the browser global;
generate RP signatures on your backend with `@worldcoin/idkit-core/signing`.

```html
<script src="https://cdn.jsdelivr.net/npm/@worldcoin/idkit-core"></script>
<script>
  async function start() {
    const sig = await fetch("/api/rp-signature").then((r) => r.json());
    const request = await IDKit.request({
      app_id: "app_xxxxx",
      action: "my-action",
      rp_context: {
        rp_id: "rp_xxxxx",
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.sig,
      },
      allow_legacy_proofs: false,
    }).constraints(IDKit.CredentialRequest("proof_of_human"));
  }
  void start();
</script>
```

## Backend: Generate RP Signature

The RP signature authenticates your verification requests. Generate it server-side using the `/signing` subpath:

```typescript
import { signRequest } from "@worldcoin/idkit-core/signing";

// Never expose RP_SIGNING_KEY to clients
const sig = signRequest({
  action: "my-action",
  signingKeyHex: process.env.RP_SIGNING_KEY!,
});

// Return to client
res.json({
  sig: sig.sig,
  nonce: sig.nonce,
  created_at: sig.createdAt,
  expires_at: sig.expiresAt,
});
```

## Client: Create Verification Request

### Using Presets

For common verification scenarios with World ID 3.0 backward compatibility:

```typescript
import { IDKit, orbLegacy } from "@worldcoin/idkit-core";

// Fetch signature from your backend
const rpSig = await fetch("/api/rp-signature").then((r) => r.json());

const request = await IDKit.request({
  app_id: "app_xxxxx",
  action: "my-action",
  rp_context: {
    rp_id: "rp_xxxxx",
    nonce: rpSig.nonce,
    created_at: rpSig.created_at,
    expires_at: rpSig.expires_at,
    signature: rpSig.sig,
  },
  allow_legacy_proofs: false,
  return_to: "myapp://idkit/callback",
}).preset(orbLegacy({ signal: "user-123" }));

// Display QR code for World App
const qrUrl = request.connectorURI;
```

**Available presets:** `orbLegacy`, `documentLegacy`, `secureDocumentLegacy`, `deviceLegacy`, `selfieCheckLegacy`, `selfieCheck`

Selfie Check preset example:

The preset requests the Selfie Check credential and always disables fallback to legacy proofs.

```typescript
import { IDKit, selfieCheck } from "@worldcoin/idkit-core";

const request = await IDKit.request({
  app_id: "app_xxxxx",
  action: "my-action",
  rp_context: rpContext,
  allow_legacy_proofs: false,
}).preset(selfieCheck({ signal: "user-123" }));
```

## Network deadlines and cancellation

Bridge creation (`.preset()` / `.constraints()`) and manual `pollOnce()` calls
accept a second/options argument with `timeout` (milliseconds, default 30,000)
and `signal` (an `AbortSignal`). The deadline includes reading the response body.
Creation rejects with `Error("timeout")` or `Error("cancelled")`; a cancelled
operation also aborts its underlying fetch. Custom fetch adapters should honor
`init.signal`. The SDK still bounds the caller's wait if an adapter ignores it.

```typescript
const controller = new AbortController();
const request = await IDKit.request(config).preset(proofOfHuman(), {
  timeout: 30_000,
  signal: controller.signal,
});
const completion = await request.pollUntilCompletion({
  timeout: 120_000,
  signal: controller.signal,
});
// Call controller.abort() when the host abandons the flow.
```

Creation and `pollUntilCompletion()` have separate deadlines. React hooks instead
share one deadline from the start of creation through completion. Polling retries
network/body-read failures and HTTP 408, 429 and 5xx at the configured interval
within that original deadline. Other HTTP errors (including bridge 404), malformed
responses and World App errors stay terminal. Creation POSTs are not retried,
except for the existing single invite-code collision retry.

For manual polling, catch `isRetryableBridgeError(error)` to decide whether to
retry. `pollUntilCompletion()` resolves a failure result for terminal errors.

## Handling the Result

Poll for the verification proof, then verify it server-side:

```typescript
// Wait for the user to scan and approve
const completion = await request.pollUntilCompletion({
  pollInterval: 2000,
  timeout: 120_000,
});

if (!completion.success) {
  console.error("Verification failed:", completion.error);
  return;
}

// Send proof to your backend for verification
const verified = await fetch("/api/verify-proof", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(completion.result),
}).then((r) => r.json());
```

On your backend, forward the result to the Developer Portal:

```typescript
const response = await fetch(
  `https://developer.worldcoin.org/api/v4/verify/${RP_ID}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  },
);

const { success } = await response.json();
```

## Subpath Exports

Subpath exports let you use individual utilities without creating a request:

| Subpath    | Exports                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| `/signing` | `signRequest`, `computeRpSignatureMessage`, `RpSignature` and `SignRequestParams` (types) |
| `/hashing` | `hashSignal`                                                                              |
| `/session` | `getSessionCommitment`                                                                    |

```typescript
import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
```
