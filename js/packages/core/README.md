# @worldcoin/idkit-core

World ID verification SDK for JavaScript/TypeScript. Zero dependencies, WASM-powered.

## Installation

```bash
npm install @worldcoin/idkit-core
```

## Backend: Generate RP Signature

The RP signature authenticates your verification requests. Generate it server-side:

```typescript
import { IDKit, signRequest } from "@worldcoin/idkit-core";

await IDKit.initServer();

// Never expose RP_SIGNING_KEY to clients
const sig = signRequest("my-action", process.env.RP_SIGNING_KEY);

// Return to client
res.json({
  sig: sig.sig,
  nonce: sig.nonce,
  created_at: Number(sig.createdAt),
  expires_at: Number(sig.expiresAt),
});
```

## Client: Create Verification Request

### Using Presets

For common verification scenarios with World ID 3.0 backward compatibility:

```typescript
import { IDKit, orbLegacy } from "@worldcoin/idkit-core";

await IDKit.init();

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
}).preset(orbLegacy({ signal: "user-123" }));

// Display QR code for World App
const qrUrl = request.connectorURI;
```

**Available presets:** `orbLegacy`, `documentLegacy`, `secureDocumentLegacy`

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
