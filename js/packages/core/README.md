# @worldcoin/idkit-core

World ID verification SDK for JavaScript/TypeScript. Zero dependencies, WASM-powered.

## Installation

```bash
npm install @worldcoin/idkit-core
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

The RP signature authenticates your verification requests. Generate it server-side using the `/signing` subpath (pure JS, no WASM init needed):

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

**Available presets:** `orbLegacy`, `documentLegacy`, `secureDocumentLegacy`, `deviceLegacy`, `selfieCheckLegacy`

Selfie check preset example:

```typescript
import { IDKit, selfieCheckLegacy } from "@worldcoin/idkit-core";

const request = await IDKit.request({
  app_id: "app_xxxxx",
  action: "my-action",
  rp_context: rpContext,
  allow_legacy_proofs: false,
}).preset(selfieCheckLegacy({ signal: "user-123" }));
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

Pure JS subpath exports are available for server-side use without WASM initialization:

| Subpath    | Exports                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| `/signing` | `signRequest`, `computeRpSignatureMessage`, `RpSignature` and `SignRequestParams` (types) |
| `/hashing` | `hashSignal`                                                                              |

```typescript
import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
```
