# IDKit Swift

Swift bindings for IDKit - World ID verification SDK built with Rust and UniFFI.

## Installation

### Swift Package Manager

Add IDKit to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/worldcoin/idkit", from: "3.0.0")
]
```

### Manual Integration

1. Build the Rust library:
   ```bash
   cd rust
   cargo build --release --package idkit-uniffi
   ```

2. Copy the generated library and Swift files to your project:
   - `target/release/libidkit.dylib` (or `.so` on Linux, `.dll` on Windows)
   - `swift/Sources/IDKit/` (all Swift files)

## Quick Start

### Verification

```swift
import IDKit

// Create a Orb verification request
let request = try Request(
    credentialType: .orb,
    signal: "user_12345"
)

let session = try Session.create(
    appId: "app_staging_123abc",
    action: "vote",
    requests: [request]
)

// Display QR code with session.verificationURL
print("Scan this URL: \(session.verificationURL)")

// Wait for proof using async/await
let proof = try await session.waitForProofAsync()
print("Verification successful! Nullifier: \(proof.nullifierHash)")
```

### Using the Status Stream

```swift
// Get real-time status updates
for try await status in session.statusStream() {
    switch status {
    case .waitingForConnection:
        print("⏳ Waiting for user to scan QR code...")

    case .awaitingConfirmation:
        print("📱 User scanned QR, awaiting confirmation...")

    case .confirmed(let proof):
        print("✅ Verified! Proof: \(proof.proof)")
        return proof

    case .failed(let error):
        print("❌ Verification failed: \(error)")
        throw SessionError.verificationFailed(error)
    }
}
```

### Using Credential Categories

```swift
// Request either personhood (iris) or secure document
let session = try Session.create(
    appId: "app_staging_123abc",
    action: "verify-identity",
    credentialCategories: [.personhood, .secureDocument],
    signal: "user_12345"
)

let proof = try await session.waitForProofAsync()
```

### Using Verification Levels (Simplified)

```swift
// Use verification level for common scenarios
let session = try Session.create(
    appId: "app_staging_123abc",
    action: "login",
    verificationLevel: .orb,
    signal: "session_token_abc"
)
```

### Multiple Requests with Constraints

```swift
// Request multiple credentials with constraints
let orbRequest = try Request(credentialType: .orb, signal: "signal_1")
let faceRequest = try Request(credentialType: .face, signal: "signal_2")

// User must have at least one of these (priority: Orb > Face)
let constraints = try Constraints.any(.orb, .face)

let session = try Session.createWithOptions(
    appId: "app_staging_123abc",
    action: "high-security-action",
    requests: [orbRequest, faceRequest],
    actionDescription: "Verify your identity",
    constraints: constraints,
    bridgeUrl: nil  // Uses production bridge
)
```

### Face Authentication

```swift
// Request face auth for additional security
let request = try Request(
    credentialType: .orb,
    signal: "sensitive_action",
    faceAuth: true
)

let session = try Session.create(
    appId: "app_staging_123abc",
    action: "transfer-funds",
    requests: [request]
)
```

### ABI-Encoded Signals (On-Chain Verification)

```swift
// For on-chain verification, use ABI-encoded signals
let abiSignal = Data([0x00, 0x01, 0x02, 0x03...])  // Your ABI-encoded data

let request = try Request(
    credentialType: .orb,
    abiEncodedSignal: abiSignal
)

let session = try Session.create(
    appId: "app_staging_123abc",
    action: "claim-airdrop",
    requests: [request]
)
```

## API Reference

### Core Types

#### `Session`

Main session class for managing World ID verifications.

**Static Methods:**
- `create(appId:action:requests:)` - Create a session with requests
- `createWithOptions(appId:action:requests:actionDescription:constraints:bridgeUrl:)` - Create with full options
- `create(appId:action:credentialCategories:signal:...)` - Create using credential categories
- `create(appId:action:verificationLevel:signal:...)` - Create using verification level
- `fromVerificationLevel(appId:action:verificationLevel:signal:)` - Direct Rust implementation

**Instance Methods:**
- `poll() -> Status` - Poll for current status (blocking)
- `statusStream() -> AsyncThrowingStream<Status, Error>` - Async stream of status updates
- `waitForProof() -> Proof` - Wait for proof (blocking)
- `waitForProofAsync(timeout:) async throws -> Proof` - Async version
- `waitForProofWithTimeout(timeoutSeconds:) -> Proof` - Wait with custom timeout
- `connectUrl() -> String` - Get connect URL string
- `requestId() -> String` - Get request ID string

**Instance Properties:**
- `verificationURL: URL` - Connect URL as URL object
- `requestUUID: UUID` - Request ID as UUID

#### `Request`

Represents a credential request.

**Initializers:**
- `Request(credentialType:signal:)` - Create with optional Signal object
- `Request(credentialType:signal:faceAuth:)` - Convenience init with string signal
- `Request(credentialType:abiEncodedSignal:faceAuth:)` - Init with ABI-encoded signal

**Methods:**
- `withFaceAuth(faceAuth:) -> Request` - Return new request with face auth

#### `Signal`

Represents a signal (string or ABI-encoded).

**Static Methods:**
- `fromString(s:) -> Signal` - Create from UTF-8 string
- `fromAbiEncoded(bytes:) -> Signal` - Create from ABI-encoded bytes

**Instance Methods:**
- `asBytes() -> [UInt8]` - Get raw bytes
- `asString() -> String?` - Get as string (if UTF-8)

**Instance Properties:**
- `data: Data` - Signal as Data
- `string: String?` - Signal as string (if UTF-8)

#### `Constraints`

Represents credential constraints.

**Static Methods:**
- `any(credentials:) -> Constraints` - At least one must match
- `all(credentials:) -> Constraints` - All must match
- `any(_:) -> Constraints` - Variadic version
- `all(_:) -> Constraints` - Variadic version

#### `ConstraintNode`

Building block for constraint trees.

**Static Methods:**
- `credential(credentialType:) -> ConstraintNode` - Leaf node
- `any(nodes:) -> ConstraintNode` - OR node
- `all(nodes:) -> ConstraintNode` - AND node

#### `Status`

Verification status enum.

**Cases:**
- `.waitingForConnection` - Waiting for World App to fetch request
- `.awaitingConfirmation` - User is reviewing in World App
- `.confirmed(Proof)` - Verification successful
- `.failed(String)` - Verification failed

#### `Proof`

Verification proof returned by World App.

**Properties:**
- `proof: String` - The zero-knowledge proof
- `merkleRoot: String` - Merkle root of the identity tree
- `nullifierHash: String` - Unique nullifier for this verification
- `verificationLevel: CredentialType` - The credential type used

#### `CredentialType`

- `.orb` - Iris biometric (World ID Orb)
- `.face` - Face check
- `.device` - Device-based credential
- `.secureDocument` - NFC document with authentication
- `.document` - NFC document without authentication

#### `VerificationLevel`

- `.orb` - Orb verification
- `.device` - Device verification
- `.secureDocument` - Secure document verification
- `.document` - Document verification

#### `CredentialCategory`

High-level credential categories.

**Cases:**
- `.personhood` - Iris code (maps to `.orb`)
- `.secureDocument` - Secure document
- `.document` - Non-secure document

**Methods:**
- `toConstraints() -> Constraints` - Convert to constraints
- `static toConstraints(_:) -> Constraints` - Convert set to constraints
- `static toRequests(_:signal:) -> [Request]` - Convert to requests

### Errors

#### `SessionError`

Errors during session operations.

**Cases:**
- `.timeout` - Verification timed out
- `.verificationFailed(String)` - Verification failed
- `.invalidURL(String)` - Invalid URL
- `.emptyRequests` - No requests provided
- `.invalidAppID(String)` - Invalid app ID

#### `IdkitError`

Rust-layer errors (from UniFFI).

**Cases:**
- `.invalidConfiguration(message:)`
- `.jsonError(message:)`
- `.cryptoError(message:)`
- `.bridgeError(message:)`
- `.connectionFailed`
- `.timeout`

## Examples

### Complex Constraint Example

```swift
// User must have Orb OR (SecureDocument AND Face)
let orbNode = ConstraintNode.credential(credentialType: .orb)
let docNode = ConstraintNode.credential(credentialType: .secureDocument)
let faceNode = ConstraintNode.credential(credentialType: .face)

let docAndFace = try ConstraintNode.all(docNode, faceNode)
let complexConstraint = try ConstraintNode.any(orbNode, docAndFace)

let constraints = Constraints(root: complexConstraint)

let session = try Session.createWithOptions(
    appId: "app_staging_123abc",
    action: "secure-action",
    requests: [orbRequest, docRequest, faceRequest],
    actionDescription: nil,
    constraints: constraints,
    bridgeUrl: nil
)
```

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

**Note:** The `Generated/` directory contains auto-generated code from UniFFI and should not be edited manually. Any changes will be overwritten when rebuilding.