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
}).preset(orbLegacy({ signal: "user-123" }));

// Display QR code for World App
const qrUrl = request.connectorURI;
```

**Available presets:** `orbLegacy`, `documentLegacy`, `secureDocumentLegacy`

### Using Constraints

For custom credential requirements using `any` (OR) and `all` (AND) combinators:

```typescript
import { IDKit, CredentialRequest, any, all } from "@worldcoin/idkit-core";

await IDKit.init();

// Fetch signature from your backend
const rpSig = await fetch("/api/rp-signature").then((r) => r.json());

const orb = CredentialRequest("orb");
const face = CredentialRequest("face");
const document = CredentialRequest("document");
const secureDocument = CredentialRequest("secure_document");

// Accept orb OR face credential
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
}).constraints(any(orb, face));

// Or require orb AND (document OR secure_document)
// .constraints(all(orb, any(document, secureDocument)))

// Display QR code for World App
const qrUrl = request.connectorURI;
```

**Credential types:** `orb`, `face`, `device`, `document`, `secure_document`
