# IDKit Swift

Swift bindings for IDKit - World ID verification SDK built with Rust and UniFFI.

## Features

- ✅ **Direct Rust API access** - Zero divergence from core implementation
- ✅ **Multiple credential requests** - Request multiple credentials in a single session
- ✅ **Constraints system** - Express complex credential requirements (ANY/ALL logic)
- ✅ **Face authentication** - Request face auth for Orb and Face credentials
- ✅ **Signal types** - Support for both UTF-8 strings and ABI-encoded signals
- ✅ **Swift async/await** - Idiomatic Swift concurrency with AsyncThrowingStream
- ✅ **Minimal wrapper** - Only essential Swift idioms, everything else from Rust

## Architecture

This Swift SDK is a **thin, idiomatic wrapper** over the Rust core:

```
┌─────────────────────────────────────┐
│   Rust Core (idkit-core)           │
│   - All business logic              │
│   - Session management              │
│   - Constraints                     │
│   - Verification                    │
└─────────────────────────────────────┘
            │ UniFFI
            ▼
┌─────────────────────────────────────┐
│   Generated Swift (100% Rust API)  │
│   - Session, Request, Signal        │
│   - CredentialType, Constraints     │
│   - Status, Proof                   │
└─────────────────────────────────────┘
            │ + Minimal Swift sugar
            ▼
┌─────────────────────────────────────┐
│   Swift Extensions (~100 lines)    │
│   - async/await wrappers            │
│   - Convenience initializers        │
│   - Property helpers                │
└─────────────────────────────────────┘
```

**Philosophy:** Keep Swift code minimal to prevent SDK divergence. All features come from Rust.

## Installation

### Swift Package Manager

```swift
dependencies: [
    .package(url: "https://github.com/worldcoin/idkit", from: "3.0.0")
]
```

## Quick Start

### Basic Verification

```swift
import IDKit

// Create signal and request
let signal = Signal.fromString(s: "user_12345")
let request = Request.new(credentialType: .orb, signal: signal)

// Create session
let session = try Session.create(
    appId: "app_staging_123abc",
    action: "vote",
    requests: [request]
)

// Display QR code
print("Scan: \(session.connectUrl())")

// Wait for proof (Swift async/await wrapper)
let proof = try await session.waitForProofAsync()
print("Verified! Nullifier: \(proof.nullifierHash)")
```

### Using Status Stream

```swift
// Real-time status updates with Swift AsyncThrowingStream
for try await status in session.statusStream() {
    switch status {
    case .waitingForConnection:
        print("⏳ Waiting for user...")
    case .awaitingConfirmation:
        print("📱 User is confirming...")
    case .confirmed(let proof):
        print("✅ Verified!")
        return proof
    case .failed(let error):
        throw SessionError.verificationFailed(error)
    }
}
```

### Using Verification Level

```swift
// Simplified API for common patterns
let session = try Session.fromVerificationLevel(
    appId: "app_staging_123abc",
    action: "login",
    verificationLevel: .orb,
    signal: "session_token"
)
```

### Multiple Requests with Constraints

```swift
let signal = Signal.fromString(s: "user_signal")

// Create multiple requests
let orbRequest = Request.new(credentialType: .orb, signal: signal)
let faceRequest = Request.new(credentialType: .face, signal: signal)

// User must have at least one (priority: Orb > Face)
let constraints = Constraints.any(credentials: [.orb, .face])

let session = try Session.createWithOptions(
    appId: "app_staging_123abc",
    action: "secure-action",
    requests: [orbRequest, faceRequest],
    actionDescription: "Verify your identity",
    constraints: constraints,
    bridgeUrl: nil
)
```

### Face Authentication

```swift
let signal = Signal.fromString(s: "sensitive_action")
let request = Request.new(credentialType: .orb, signal: signal)
    .withFaceAuth(faceAuth: true)

let session = try Session.create(
    appId: "app_staging_123abc",
    action: "transfer-funds",
    requests: [request]
)
```

### ABI-Encoded Signals

```swift
// For on-chain verification
let abiSignal = Signal.fromAbiEncoded(bytes: [0x00, 0x01, ...])
let request = Request.new(credentialType: .orb, signal: abiSignal)
```

### Swift Convenience Initializers

```swift
// Request+Extensions provides sugar for common cases
let request = try Request(
    credentialType: .orb,
    signal: "user_12345",  // String directly
    faceAuth: true
)

// Equivalent to:
let signal = Signal.fromString(s: "user_12345")
let request = Request.new(credentialType: .orb, signal: signal)
    .withFaceAuth(faceAuth: true)
```

## API Reference

### Core Types (Generated from Rust)

All core types are generated by UniFFI from the Rust implementation. This ensures 100% consistency.

#### `Session`

**Static Methods:**
- `create(appId:action:requests:)` - Create session
- `createWithOptions(appId:action:requests:actionDescription:constraints:bridgeUrl:)` - Full options
- `fromVerificationLevel(appId:action:verificationLevel:signal:)` - Convenience method

**Instance Methods:**
- `poll() -> Status` - Poll for status (blocking)
- `waitForProof() -> Proof` - Wait for proof (blocking)
- `waitForProofWithTimeout(timeoutSeconds:) -> Proof` - With timeout
- `connectUrl() -> String` - Get connection URL
- `requestId() -> String` - Get request ID

**Swift Extensions:**
- `statusStream() -> AsyncThrowingStream<Status, Error>` - Async polling
- `waitForProofAsync(timeout:) async throws -> Proof` - Swift async/await
- `verificationURL: URL` - URL object (vs String)
- `requestUUID: UUID` - UUID object (vs String)

#### `Request`

**From Rust:**
- `Request.new(credentialType:signal:)` - Create request
- `withFaceAuth(faceAuth:) -> Request` - Add face auth

**Swift Convenience:**
- `Request(credentialType:signal:faceAuth:)` - String signal
- `Request(credentialType:abiEncodedSignal:faceAuth:)` - Data signal

#### `Signal`

- `Signal.fromString(s:) -> Signal` - From UTF-8 string
- `Signal.fromAbiEncoded(bytes:) -> Signal` - From ABI bytes
- `asBytes() -> [UInt8]` - Get bytes
- `asString() -> String?` - Get string (if UTF-8)
- Swift: `data: Data`, `string: String?` properties

#### `Constraints`

- `Constraints.any(credentials:)` - At least one must match
- `Constraints.all(credentials:)` - All must match
- `Constraints.new(root:)` - From constraint node

#### `ConstraintNode`

- `ConstraintNode.credential(credentialType:)` - Leaf node
- `ConstraintNode.any(nodes:)` - OR node
- `ConstraintNode.all(nodes:)` - AND node

#### `Status`

```swift
enum Status {
    case waitingForConnection
    case awaitingConfirmation
    case confirmed(Proof)
    case failed(String)
}
```

#### `Proof`

```swift
struct Proof {
    let proof: String
    let merkleRoot: String
    let nullifierHash: String
    let verificationLevel: CredentialType
}
```

#### `CredentialType`

```swift
enum CredentialType {
    case orb        // Iris biometric
    case face       // Face biometric
    case device     // Device-based
    case secureDocument  // NFC with auth
    case document   // NFC without auth
}
```

#### `VerificationLevel`

```swift
enum VerificationLevel {
    case orb
    case device
    case secureDocument
    case document
}
```

### Errors

#### `SessionError` (Swift-only)

```swift
enum SessionError: Error {
    case timeout
    case verificationFailed(String)
    case invalidURL(String)
    case emptyRequests
    case invalidAppID(String)
}
```

#### `IdkitError` (from Rust)

All Rust errors are automatically mapped to Swift errors by UniFFI.

## Building from Source

The generated Swift bindings (`swift/Sources/IDKit/Generated/`) are excluded from git and must be regenerated locally.

```bash
# Build the Rust library and generate Swift bindings
./scripts/build-swift.sh

# Or manually:
cargo build --release --package idkit-uniffi
uniffi-bindgen generate \
    --library target/release/libidkit.dylib \
    --language swift \
    --out-dir swift/Sources/IDKit/Generated
```

**Note:** The `Generated/` directory contains auto-generated code from UniFFI and should not be edited manually.

## Design Philosophy

### Why Minimal Swift Code?

This SDK follows a **zero-divergence** philosophy:

1. **All business logic in Rust** - Session management, crypto, constraints
2. **UniFFI generates Swift API** - Direct 1:1 mapping, no translation layer
3. **Minimal Swift extensions** - Only Swift-specific idioms (async/await, convenience)

**Benefits:**
- ✅ Zero chance of Swift-specific bugs
- ✅ Features available immediately (no Swift porting needed)
- ✅ Easy to maintain (only ~100 lines of Swift code)
- ✅ Consistent behavior across all platforms
- ✅ Users can reference Rust docs directly

**What We DON'T Do:**
- ❌ Create Swift-only concepts (no `CredentialCategory`)
- ❌ Wrap every enum with `Codable`/`CustomStringConvertible`
- ❌ Provide multiple ways to do the same thing
- ❌ Add variadic sugar for array parameters

### Custom Swift Code

Only 3 files with custom Swift code (~100 lines total):

1. **Session+Extensions.swift** (~60 lines) - Async/await, status streaming
2. **Request+Extensions.swift** (~30 lines) - String/Data convenience inits
3. **IDKit.swift** (~10 lines) - Version constant

Everything else: **Use Rust API directly via UniFFI**

## Examples

See `Examples/BasicVerification.swift` for complete examples covering:
- Basic verification
- Status streaming
- Verification levels
- Constraints
- Face authentication
- ABI-encoded signals
- Convenience initializers

## Testing

Tests verify the Rust API works correctly from Swift. See `Tests/IDKitTests/` for comprehensive test coverage.

## License

MIT OR Apache-2.0

## Links

- [GitHub Repository](https://github.com/worldcoin/idkit)
- [Rust Documentation](../rust/core/README.md)
- [World ID Documentation](https://docs.world.org)
- [Developer Portal](https://developer.worldcoin.org)
