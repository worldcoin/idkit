# @worldcoin/idkit-core

World ID verification SDK for JavaScript/TypeScript.

## Installation

```bash
npm install @worldcoin/idkit-core
```

## Quickstart

### Requirements

From the [Developer Portal](https://developer.world.org): `app_id`, `rp_id`, and an RP signing key. Keep the signing key on your backend only.

There are two ways you can request proofs with IDKit, and they depend on how you want to use the SDK.

If you want to request a World ID session-scoped proof, use `IDKit.createSession()` and store the result `session_id`. You can then use `IDKit.proveSession` with `session_id` as a parameter to log and sync existing users with their session data.

```js
import { IDKit } from "@worldcoin/idkit-core";

const rp_context = await fetch("/api/rp-signature").then((r) => r.json());

// First visit — mint a session_id and store it server-side
const IDKitSessionRequest = await IDKit.createSession({
  app_id: "app_xxxxx",
  rp_context, // pass through from your backend
}).constraints(IDKit.CredentialRequest("proof_of_human")); // → IDKitRequest

const result = await IDKitSessionRequest.pollUntilCompletion();
// → { success: true, result: IDKitResultSession } | { success: false, error }
if (!result.success) {
  // user rejected, timeout, etc. — no result to read
  console.error(result.error);
  return;
}
// IDKitResultSession: {
//   protocol_version: "4.0",
//   session_id: "session_<hex>",
//   nonce: string,
//   responses: [{ identifier, proof, session_nullifier, ... }],
//   environment: string,
//   ...
// }
// verify on your backend first, then save result.result.session_id in your DB
```

```js
// Return visit — look up that session_id, then prove it
const rp_context = await fetch("/api/rp-signature").then((r) => r.json());

const IDKitSessionRequest = await IDKit.proveSession(savedSessionId, {
  app_id: "app_xxxxx",
  rp_context, // pass through from your backend
}).constraints(IDKit.CredentialRequest("proof_of_human")); // → IDKitRequest

const result = await IDKitSessionRequest.pollUntilCompletion();
if (!result.success) {
  console.error(result.error);
  return;
}
// same shape as createSession — result.result.session_id matches for the same user
// verify on your backend before treating the login as complete
```

If you want to request a credential based on an action-key scope, use `IDKit.request()` and store the nullifier.

```js
const rp_context = await fetch("/api/rp-signature").then((r) => r.json());

const request = await IDKit.request({
  app_id: "app_xxxxx",
  action: "my-action",
  rp_context, // pass through from your backend
  allow_legacy_proofs: false,
}).constraints(IDKit.CredentialRequest("proof_of_human")); // → IDKitRequest

const completion = await request.pollUntilCompletion();
if (!completion.success) {
  console.error(completion.error);
  return;
}
// IDKitResult (v4 uniqueness): {
//   protocol_version: "4.0",
//   action: string,
//   nonce: string,
//   responses: [{ identifier, proof, nullifier, ... }],
//   environment: string,
//   ...
// }
// send completion.result to your backend → /api/v4/verify/{rp_id}
// only then store the nullifier; same person + same action = reject on return
```

### Handling the result

Result should always be handled in the backend. A good practice is to have a dedicated `/api/verify` route file where you have some form of the following:

```typescript
import type { IDKitResult } from "@worldcoin/idkit-core";

// proof = completion.result from pollUntilCompletion()
async function verifyProof(proof: IDKitResult, rpId: string) {
  const response = await fetch(
    `https://developer.world.org/api/v4/verify/${rpId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
    },
  );

  const { success } = await response.json();
  return success;
}
```

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

The WASM file is fetched automatically from the same CDN directory as the
script (`idkit_wasm_bg.wasm`). RP signing is intentionally not exposed on the
browser global; generate RP signatures on your backend with
`@worldcoin/idkit-core/signing`.

```html
<script src="https://cdn.jsdelivr.net/npm/@worldcoin/idkit-core"></script>
<script>
  async function start() {
    const rp_context = await fetch("/api/rp-signature").then((r) => r.json());
    const request = await IDKit.request({
      app_id: "app_xxxxx",
      action: "my-action",
      rp_context, // pass through from your backend
      allow_legacy_proofs: false,
    }).constraints(IDKit.CredentialRequest("proof_of_human"));
  }
  void start();
</script>
```

## Backend: Generate RP Signature

That `rp_context` in the examples above comes from your backend. Generate it server-side with the `/signing` subpath (pure JS, no WASM init needed):

```typescript
import { signRequest } from "@worldcoin/idkit-core/signing";

// Never expose RP_SIGNING_KEY to clients
const sig = signRequest({
  action: "my-action", // omit for session flows
  signingKeyHex: process.env.RP_SIGNING_KEY!,
});

// Return to client — this is your rp_context payload
res.json({
  rp_id: process.env.RP_ID!, // "rp_xxxxx"
  nonce: sig.nonce,
  created_at: sig.createdAt,
  expires_at: sig.expiresAt,
  signature: sig.sig,
});
```

## Using Presets

If you need World ID 3.0 backward compatibility on `IDKit.request()`, swap `.constraints(...)` for a preset (sessions don't support presets):

```typescript
import { IDKit, orbLegacy } from "@worldcoin/idkit-core";

const rp_context = await fetch("/api/rp-signature").then((r) => r.json());

const request = await IDKit.request({
  app_id: "app_xxxxx",
  action: "my-action",
  rp_context, // pass through from your backend
  allow_legacy_proofs: true,
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

**Legacy presets:** `orbLegacy`, `documentLegacy`, `secureDocumentLegacy`, `deviceLegacy`, `selfieCheckLegacy`

**Also available:** `proofOfHuman`, `passport`, `mnc`, `identityCheck` — these still enable legacy fallback (even with `allow_legacy_proofs: false`).

## Subpath Exports

Pure JS subpath exports are available for server-side use without WASM initialization:

| Subpath    | Exports                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| `/signing` | `signRequest`, `computeRpSignatureMessage`, `RpSignature` and `SignRequestParams` (types) |
| `/hashing` | `hashSignal`                                                                              |

```typescript
import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
```
