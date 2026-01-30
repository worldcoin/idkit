# IDKit Kotlin

World ID verification SDK for Kotlin/Android. Powered by Rust via UniFFI.

## Installation

```gradle
dependencies {
    implementation("com.worldcoin:idkit:4.0.1")
}
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

```kotlin
import com.worldcoin.idkit.*

// Fetch signature from your backend
val rpSig = fetchRpSignature()

val rpContext = IdKit.rpContext(
    rpId = "rp_xxxxx",
    nonce = rpSig.nonce,
    createdAt = rpSig.createdAt.toULong(),
    expiresAt = rpSig.expiresAt.toULong(),
    signature = rpSig.sig,
)

val config = IdKit.requestConfig(
    appId = "app_xxxxx",
    action = "my-action",
    rpContext = rpContext,
)

val request = IdKit.request(config)
    .preset(orbLegacy(signal = "user-123"))

// Display QR code for World App
val qrUrl = request.connectUrl()
```

**Available presets:** `orbLegacy`, `documentLegacy`, `secureDocumentLegacy`

### Using Constraints

For custom credential requirements using `anyOf` (OR) and `allOf` (AND) combinators:

```kotlin
import com.worldcoin.idkit.*

// Fetch signature from your backend
val rpSig = fetchRpSignature()

val rpContext = IdKit.rpContext(
    rpId = "rp_xxxxx",
    nonce = rpSig.nonce,
    createdAt = rpSig.createdAt.toULong(),
    expiresAt = rpSig.expiresAt.toULong(),
    signature = rpSig.sig,
)

val config = IdKit.requestConfig(
    appId = "app_xxxxx",
    action = "my-action",
    rpContext = rpContext,
)

val orb = CredentialRequest(CredentialType.ORB)
val face = CredentialRequest(CredentialType.FACE)
val document = CredentialRequest(CredentialType.DOCUMENT)
val secureDocument = CredentialRequest(CredentialType.SECURE_DOCUMENT)

// Accept orb OR face credential
val request = IdKit.request(config)
    .constraints(anyOf(orb, face))

// Or require orb AND (document OR secure_document)
// .constraints(allOf(orb, anyOf(document, secureDocument)))

// Display QR code for World App
val qrUrl = request.connectUrl()
```

**Credential types:** `ORB`, `FACE`, `DEVICE`, `DOCUMENT`, `SECURE_DOCUMENT`
