# IDKit Swift

Swift bindings for the World ID SDK, built with Rust and UniFFI.

## Features

- 🦀 **Rust-powered**: Core logic written in Rust for performance and safety
- 📱 **Native Swift API**: Idiomatic Swift interface with async/await support
- 🔐 **AES-256-GCM encryption**: Secure communication with World App
- ✅ **Type-safe**: Full type safety with Swift enums and structs

## Installation

### Swift Package Manager

Add to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/worldcoin/idkit", from: "3.0.0")
]
```

Or add in Xcode:
1. File > Add Package Dependencies
2. Enter repository URL
3. Select version/branch

### Manual Installation

1. Copy the generated Swift files to your project:
   - `Sources/IDKit/idkit.swift`
   - `Sources/IDKit/idkitFFI.h`
   - `Sources/IDKit/idkitFFI.modulemap`

2. Add the native library:
   - Copy `libidkit.a` or `libidkit.dylib` to your project
   - Link the library in Build Phases

## Usage

### Initialize IDKit

```swift
import IDKit

// Initialize once at app startup
init()
```

### Create a Verification Session

**Option 1: Legacy API with Verification Level**

```swift
let session = try IdkitSession.fromVerificationLevel(
    appId: "app_staging_1234567890abcdef",
    action: "verify-human",
    verificationLevel: .orb,
    signal: "user_12345"
)
```

**Option 2: New API with Credential Requests** (Recommended)

```swift
let requests = [
    RequestConfig(
        credentialType: .orb,
        signal: "user_12345",
        faceAuth: nil
    )
]

let session = try IdkitSession.withRequests(
    appId: "app_staging_1234567890abcdef",
    action: "verify-human",
    requests: requests
)
```

### Get Connect URL

```swift
let connectUrl = session.connectUrl()
print(connectUrl)
// https://worldcoin.org/verify?t=wld&i=...&k=...

// Generate QR code from connectUrl and display to user
```

### Wait for Proof

**Option 1: Poll for Status**

```swift
while true {
    let status = try session.poll()

    switch status {
    case .waitingForConnection:
        print("Waiting for user to scan QR code...")
    case .awaitingConfirmation:
        print("Waiting for user confirmation...")
    case .confirmed(let proof):
        print("Verified!")
        handleProof(proof)
        break
    case .failed(let error):
        print("Failed: \(error)")
        break
    }

    try await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
}
```

**Option 2: Wait for Proof (Blocking)**

```swift
do {
    let proof = try session.waitForProof(timeoutMs: 120_000) // 2 minute timeout
    handleProof(proof)
} catch IdkitError.timeout {
    print("Verification timed out")
} catch {
    print("Error: \(error)")
}
```

### Handle Proof

```swift
func handleProof(_ proof: Proof) {
    print("Proof: \(proof.proof)")
    print("Merkle Root: \(proof.merkleRoot)")
    print("Nullifier Hash: \(proof.nullifierHash)")
    print("Verification Level: \(proof.verificationLevel)")

    // Send to your backend for verification
    verifyProofOnBackend(proof)
}
```

## API Reference

### Types

#### `IdkitSession`

Main session interface for World ID verification.

**Constructors:**
- `fromVerificationLevel(appId:action:verificationLevel:signal:)` - Legacy API
- `withRequests(appId:action:requests:)` - New API with credential requests

**Methods:**
- `connectUrl() -> String` - Get the World App connect URL
- `poll() -> SessionStatus` - Poll for current status (non-blocking)
- `waitForProof(timeoutMs:) -> Proof` - Wait for proof (blocking, optional timeout)

#### `Credential`

Verification credential types:
- `.orb` - Orb verification
- `.face` - Face authentication
- `.secureDocument` - Secure document verification
- `.document` - Document verification
- `.device` - Device verification

#### `VerificationLevel` (Legacy)

Legacy verification levels for backward compatibility:
- `.orb`
- `.face`
- `.device`
- `.document`
- `.secureDocument`

#### `SessionStatus`

Verification session status:
- `.waitingForConnection` - Waiting for user to scan QR code
- `.awaitingConfirmation` - Waiting for user to confirm
- `.confirmed(Proof)` - Verification complete
- `.failed(String)` - Verification failed

#### `Proof`

World ID proof data:
- `proof: String` - The zero-knowledge proof
- `merkleRoot: String` - Merkle tree root
- `nullifierHash: String` - Unique nullifier for this action
- `verificationLevel: Credential` - Credential type that was verified

#### `IdkitError`

Error types:
- `.invalidConfiguration(String)` - Invalid configuration
- `.networkError(String)` - Network communication error
- `.cryptoError(String)` - Cryptography error
- `.appError(String)` - World App error
- `.timeout` - Request timed out
- `.invalidProof(String)` - Invalid proof

## Examples

See `Examples/VerifyExample.swift` for a complete working example.

To run the example:

```bash
cd swift
swift Examples/VerifyExample.swift
```

## Building from Source

### Prerequisites

- Rust 1.70+
- Swift 5.5+
- Xcode Command Line Tools

### Build Steps

1. Install UniFFI bindgen:
   ```bash
   pip3 install uniffi-bindgen==0.28.3
   ```

2. Build Rust library:
   ```bash
   cd rust/uniffi-bindings
   cargo build --release
   ```

3. Generate Swift bindings:
   ```bash
   uniffi-bindgen generate src/idkit.udl --language swift --out-dir ../../swift/Sources/IDKit
   ```

4. The generated files are:
   - `swift/Sources/IDKit/idkit.swift` - Swift interface
   - `swift/Sources/IDKit/idkitFFI.h` - C header
   - `swift/Sources/IDKit/idkitFFI.modulemap` - Module map
   - `target/release/libidkit.dylib` - Native library (macOS)
   - `target/release/libidkit.a` - Static library

## Platform Support

- ✅ iOS 13.0+
- ✅ macOS 10.15+
- ✅ tvOS 13.0+
- ✅ watchOS 6.0+

## License

MIT

## Support

- Documentation: https://docs.worldcoin.org
- Issues: https://github.com/worldcoin/idkit/issues
- Discord: https://discord.gg/worldcoin
