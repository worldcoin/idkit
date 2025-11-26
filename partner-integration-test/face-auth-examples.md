# Requesting Orb or Face With Face Authentication (IDKit 3.0.0)

This shows how to request **either Orb or Face credentials** with `face_auth = true` using explicit requests (new model) across JS, Kotlin, and Swift.

> All snippets assume IDKit 3.0.0 and the explicit-request API (no reliance on `verification_level`).

## Kotlin (idkit-kotlin 3.0.0)

```kotlin
import com.worldcoin.idkit.IdKit
import uniffi.idkit.CredentialType
import uniffi.idkit.Session

val orb = IdKit.request(CredentialType.ORB, faceAuth = true)
val face = IdKit.request(CredentialType.FACE, faceAuth = true)

val constraints = IdKit.anyOf(CredentialType.ORB, CredentialType.FACE)

val session: Session = IdKit.session(
    appId = "app_123",
    action = "face-check",
    requests = listOf(orb, face),
    constraints = constraints,
)

val connectUrl = session.connectUrl()
```

## Swift (IDKit 3.0.0)

```swift
import IDKit

let orb = try Request(credentialType: .orb, signal: nil, faceAuth: true)
let face = try Request(credentialType: .face, signal: nil, faceAuth: true)

let constraints = Constraints.any([.orb, .face])

let session = try Session.createWithOptions(
    appId: "app_123",
    action: "face-check",
    requests: [orb, face],
    actionDescription: nil,
    constraints: constraints,
    bridgeUrl: nil
)

let connectUrl = session.connectUrl()
```

## JavaScript (idkit-core 3.0.0)

```ts
import { useWorldBridgeStore, type CredentialType } from '@worldcoin/idkit-core'

const store = useWorldBridgeStore()

await store.createClient({
  app_id: 'app_123',
  action: 'face-check',
  requests: [
    { credential_type: 'orb' satisfies CredentialType, face_auth: true },
    { credential_type: 'face' satisfies CredentialType, face_auth: true },
  ],
})

// store.connectorURI is the connect URL (use as QR)
```

Notes:
- Constraints default to "any-of the provided requests" in order, so the above works without a constraints block.
- `face_auth` is only valid for `orb` and `face` credentials; validation occurs in the core.
