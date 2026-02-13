# IDKit Swift SDK

Swift SDK for World ID verification, backed by the Rust core via UniFFI.

## Requirements

- Xcode 16+
- iOS 15+ / macOS 12+
- Rust toolchain (for local artifact generation)

## Local setup

From repo root:

```bash
bash scripts/package-swift.sh
```

This builds Rust artifacts, regenerates Swift bindings, and links `swift/IDKitFFI.xcframework`.

## Quickstart

```swift
import IDKit

let rpContext = try RpContext(
    rpId: "rp_1234567890abcdef",
    nonce: backend.nonce,
    createdAt: backend.createdAt,
    expiresAt: backend.expiresAt,
    signature: backend.sig
)

let config = IDKitRequestConfig(
    appId: "app_staging_1234567890abcdef",
    action: "login",
    rpContext: rpContext,
    actionDescription: "Log in",
    bridgeUrl: nil,
    allowLegacyProofs: false,
    overrideConnectBaseUrl: nil,
    environment: .staging
)

let request = try IDKit
    .request(config: config)
    .preset(orbLegacy(signal: "user-123"))

print("Connector URL:", request.connectorURL)

let completion = await request.pollUntilCompletion()
switch completion {
case .success(let result):
    print("Verified", result)
case .failure(let error):
    print("Failed", error.rawValue)
}
```

## Canonical Swift API

- Entry points:
  - `IDKit.request(config:)`
  - `IDKit.createSession(config:)`
  - `IDKit.proveSession(sessionId:config:)`
- Request object:
  - `connectorURL: URL`
  - `requestID: UUID`
  - `pollStatusOnce() async -> IDKitStatus`
  - `pollUntilCompletion(options:) async -> IDKitCompletionResult`
- Hashing:
  - `IDKit.hashSignal(_ signal: String) -> String`
  - `IDKit.hashSignal(_ signal: Data) -> String`

See parity mapping: `swift/docs/API_PARITY_MATRIX.md`.

## Request item ergonomics

```swift
let orb = try CredentialRequest.create(
    .orb,
    options: .init(
        signal: "user-123",
        genesisIssuedAtMin: 1_700_000_000,
        expiresAtMin: 1_800_000_000
    )
)
```

## Xcode sample app

A runnable iOS sample exists at:

- `swift/Examples/IDKitSampleApp/IDKitSampleApp.xcodeproj`

Run it:

1. `bash scripts/package-swift.sh`
2. `open swift/Examples/IDKitSampleApp/IDKitSampleApp.xcodeproj`
3. Choose `IDKitSampleApp` scheme and an iOS Simulator.
4. Tap **Generate Connector URL**.
5. Confirm the URL appears in UI and in the console (`IDKit connector URL: ...`).

## Local verification loop

1. `bash scripts/package-swift.sh`
2. `cd swift && swift build && swift test`
3. `cd swift && xcodebuild test -scheme IDKit -destination "platform=macOS"`
4. `xcodebuild -project swift/Examples/IDKitSampleApp/IDKitSampleApp.xcodeproj -scheme IDKitSampleApp -destination "generic/platform=iOS Simulator" CODE_SIGNING_ALLOWED=NO build`

## Troubleshooting

- `Cannot find libidkitFFI.a`:
  - Re-run `bash scripts/package-swift.sh`.
- `Failed to connect` / `connection_failed`:
  - Check bridge URL/network and backend-generated RP context values.
- `timeout`:
  - Increase `IDKitPollOptions(timeoutMs:)` or verify user completed flow in World App.
- `cancelled`:
  - The polling task was cancelled by the host app.
