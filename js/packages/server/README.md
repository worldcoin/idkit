# @worldcoin/idkit-server

Server-side World ID RP signing and session utilities, implemented in JavaScript
and checked against native Rust fixtures. Supports CommonJS and ES modules on
Node.js 18 and newer. No Rust compiler or WASM runtime is required.

## Installation and signing

```sh
npm install @worldcoin/idkit-server
```

```typescript
import { signRequest } from "@worldcoin/idkit-server";

const signature = signRequest({
  signingKeyHex: process.env.RP_SIGNING_KEY!,
  action: "my-action",
  ttl: 300,
});

// Map these fields into the client's RP context.
const rpContext = {
  rp_id: process.env.RP_ID!,
  nonce: signature.nonce,
  signature: signature.sig,
  created_at: signature.createdAt,
  expires_at: signature.expiresAt,
};
```

Omit `action` when signing session requests. Keep signing keys on the backend.
`computeRpSignatureMessage` exposes the signed message construction, and
`getSessionCommitment` extracts the commitment from a session ID.

The conditional Node entry supplies secure nonce entropy when global Web Crypto
is unavailable, including Node.js 18 CommonJS environments. It does not mutate
`globalThis.crypto`. The portable entry avoids Node imports; importing utilities
from client packages does not execute host crypto initialization. Signing remains
a server operation and is rejected in client environments.

The cryptographic dependencies are `@noble/secp256k1` and `@noble/hashes`, bundled
into the builds. Core and React also expose signing through their `/signing`
subpaths. See the [JavaScript development guide](../../README.md) for native Rust
compatibility tests and the [release checklist](../../../docs/pure-js-sdk-release.md)
for package release ordering.
