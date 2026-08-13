# @worldcoin/idkit-core

World ID verification SDK for JavaScript/TypeScript. Zero dependencies, WASM-powered.

## Installation

```bash
npm install @worldcoin/idkit-core
```

## Quickstart

There are two ways you can request proofs with IDKit, and they depend on how you want to use the SDK.

If you want to request a World ID session-scoped proof, use `IDKit.createSession()` and store the result `session_id`. You can then use `IDKit.proveSession` with `session_id` as a parameter to log and sync existing users with their session data.

```js
import { IDKit } from "@worldcoin/idkit-core";

// First visit — mint a session_id and store it server-side
const IDKitSessionRequest = await IDKit.createSession({
  app_id: "app_xxxxx",
  rp_context: {
    /* from your backend */
  },
}).constraints(IDKit.CredentialRequest("proof_of_human")); // → IDKitRequest

const result = await IDKitSessionRequest.pollUntilCompletion();
// → { success: true, result: IDKitResultSession } | { success: false, error }
// IDKitResultSession: {
//   protocol_version: "4.0",
//   session_id: "session_<hex>",
//   nonce: string,
//   responses: [{ identifier, proof, session_nullifier, ... }],
//   environment: string,
//   ...
// }
// save result.result.session_id in your DB
```

```js
// Return visit — look up that session_id, then prove it
const IDKitSessionRequest = await IDKit.proveSession(savedSessionId, {
  app_id: "app_xxxxx",
  rp_context: {
    /* from your backend */
  },
}).constraints(IDKit.CredentialRequest("proof_of_human")); // → IDKitRequest

const result = await IDKitSessionRequest.pollUntilCompletion();
// → { success: true, result: IDKitResultSession } | { success: false, error }
// same shape as createSession — result.result.session_id matches for the same user
```

If you want to request a credential based on an action-key scope, use `IDKit.request()' and store the nullifier.

```js
const request = await IDKit.request({
  app_id: "app_xxxxx",
  action: "claim-airdrop-2026",
  rp_context: {
    /* from your backend */
  },
  allow_legacy_proofs: false,
}).constraints(IDKit.CredentialRequest("proof_of_human")); // → IDKitRequest

const completion = await request.pollUntilCompletion();
// → { success: true, result: IDKitResult } | { success: false, error }
// IDKitResult (v4 uniqueness): {
//   protocol_version: "4.0",
//   action: string,
//   nonce: string,
//   responses: [{ identifier, proof, nullifier, ... }],
//   environment: string,
//   ...
// }
// send completion.result to your backend → /api/v4/verify/{rp_id}
// store the nullifier; same person + same action = reject on return
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
`IDKit.enumerate`, the World ID 4.0 helpers (`proofOfHuman`, `passport`,
`mnc`, `identityCheck`), and the legacy migration presets.

The WASM file is fetched automatically from the same CDN directory as the
script (`idkit_wasm_bg.wasm`). RP signing is intentionally not exposed on the
browser global; generate RP signatures on your backend with
`@worldcoin/idkit-core/signing`.

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
  sig: sig.sig,
  nonce: sig.nonce,
  created_at: sig.createdAt,
  expires_at: sig.expiresAt,
});
```

## Using Presets

If you need World ID 3.0 backward compatibility, swap `.constraints(...)` for a legacy preset on `IDKit.request()` (sessions don't support presets):

```typescript
import { IDKit, orbLegacy } from "@worldcoin/idkit-core";

const request = await IDKit.request({
  app_id: "app_xxxxx",
  action: "my-action",
  rp_context: {
    /* from your backend */
  },
  allow_legacy_proofs: true,
}).preset(orbLegacy({ signal: "user-123" }));
```

**Available legacy presets** (`allow_legacy_proofs: true`): `orbLegacy`, `documentLegacy`, `secureDocumentLegacy`, `deviceLegacy`, `selfieCheckLegacy`

If `allow_legacy_proofs` is `false`, available v4.0 presets are: `proofOfHuman`, `passport`, `mnc`, `identityCheck`

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
