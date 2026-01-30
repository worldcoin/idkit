# IDKit Swift

World ID verification SDK for Swift/iOS. Powered by Rust via UniFFI.

## Installation

```swift
dependencies: [
    .package(url: "https://github.com/worldcoin/idkit-swift", from: "4.0.1")
]
```

## Backend: Generate RP Signature

The RP signature authenticates your verification requests. Generate it on your backend server (e.g., using the JS SDK):

```typescript
// Backend (Node.js)
import { IDKit, signRequest } from '@worldcoin/idkit-core';

await IDKit.initServer();

// Never expose RP_SIGNING_KEY to clients
const sig = signRequest('my-action', process.env.RP_SIGNING_KEY);

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

```swift
import IDKit

// Fetch signature from your backend
let rpSig = try await fetchRpSignature()

let rpContext = try RpContext(
    rpId: "rp_xxxxx",
    nonce: rpSig.nonce,
    createdAt: UInt64(rpSig.createdAt),
    expiresAt: UInt64(rpSig.expiresAt),
    signature: rpSig.sig
)

let config = IDKitRequestConfig(
    appId: "app_xxxxx",
    action: "my-action",
    rpContext: rpContext,
    actionDescription: nil,
    bridgeUrl: nil
)

let request = try IDKit.request(config: config)
    .preset(preset: orbLegacy(signal: "user-123"))

// Display QR code for World App
let qrUrl = request.connectUrl()
```

**Available presets:** `orbLegacy`, `documentLegacy`, `secureDocumentLegacy`

### Using Constraints

For custom credential requirements using `anyOf` (OR) and `allOf` (AND) combinators:

```swift
import IDKit

// Fetch signature from your backend
let rpSig = try await fetchRpSignature()

let rpContext = try RpContext(
    rpId: "rp_xxxxx",
    nonce: rpSig.nonce,
    createdAt: UInt64(rpSig.createdAt),
    expiresAt: UInt64(rpSig.expiresAt),
    signature: rpSig.sig
)

let config = IDKitRequestConfig(
    appId: "app_xxxxx",
    action: "my-action",
    rpContext: rpContext,
    actionDescription: nil,
    bridgeUrl: nil
)

let orb = CredentialRequest.create(.orb)
let face = CredentialRequest.create(.face)
let document = CredentialRequest.create(.document)
let secureDocument = CredentialRequest.create(.secureDocument)

// Accept orb OR face credential
let request = try IDKit.request(config: config)
    .constraints(constraints: anyOf(orb, face))

// Or require orb AND (document OR secure_document)
// .constraints(constraints: allOf(orb, anyOf(document, secureDocument)))

// Display QR code for World App
let qrUrl = request.connectUrl()
```

**Credential types:** `.orb`, `.face`, `.device`, `.document`, `.secureDocument`
