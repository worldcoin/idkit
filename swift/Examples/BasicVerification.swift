import Foundation
import IDKit

/// Example: Basic Orb verification
///
/// This example demonstrates creating a World ID verification session
/// using the Rust API directly.
@available(macOS 12.0, iOS 15.0, *)
func basicVerification() async throws {
    // Step 1: Create a signal and request
    let signal = Signal.fromString(s: "user_action_12345")
    let request = Request.new(
        credentialType: .orb,
        signal: signal
    )

    // Step 2: Create a session
    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        requests: [request]
    )

    // Step 3: Display the QR code URL to the user
    print("📱 Scan this QR code in World App:")
    print(session.connectUrl())
    print()

    // Step 4: Wait for the proof using async/await
    print("⏳ Waiting for verification...")
    let proof = try await session.waitForProofAsync()

    // Step 5: Verification successful!
    print("✅ Verification successful!")
    print("   Nullifier Hash: \(proof.nullifierHash)")
    print("   Merkle Root: \(proof.merkleRoot)")
    print("   Verification Level: \(proof.verificationLevel)")
}

/// Example: Using the status stream for real-time updates
@available(macOS 12.0, iOS 15.0, *)
func verificationWithStatusUpdates() async throws {
    let signal = Signal.fromString(s: "user_action_12345")
    let request = Request.new(credentialType: .orb, signal: signal)

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        requests: [request]
    )

    print("📱 QR Code URL: \(session.connectUrl())\n")

    // Monitor status in real-time
    for try await status in session.statusStream() {
        switch status {
        case .waitingForConnection:
            print("⏳ Waiting for user to scan QR code...")

        case .awaitingConfirmation:
            print("📱 User scanned code! Awaiting confirmation in World App...")

        case .confirmed(let proof):
            print("✅ Verification complete!")
            print("   Proof: \(proof.proof.prefix(64))...")
            return

        case .failed(let error):
            print("❌ Verification failed: \(error)")
            throw SessionError.verificationFailed(error)
        }
    }
}

/// Example: Using verification level (Rust convenience method)
@available(macOS 12.0, iOS 15.0, *)
func verificationWithLevel() async throws {
    let session = try Session.fromVerificationLevel(
        appId: "app_staging_1234567890abcdef",
        action: "login",
        verificationLevel: .orb,
        signal: "session_token_abc123"
    )

    print("📱 QR Code: \(session.connectUrl())\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Logged in! Nullifier: \(proof.nullifierHash)")
}

/// Example: Multiple requests with constraints
@available(macOS 12.0, iOS 15.0, *)
func verificationWithConstraints() async throws {
    // Create multiple requests
    let signal = Signal.fromString(s: "user_signal")
    let orbRequest = Request.new(credentialType: .orb, signal: signal)
    let faceRequest = Request.new(credentialType: .face, signal: signal)
    let deviceRequest = Request.new(credentialType: .device, signal: signal)

    // User must have at least one of: Orb, Face, or Device
    // Priority: Orb > Face > Device
    let constraints = Constraints.any(credentials: [.orb, .face, .device])

    let session = try Session.createWithOptions(
        appId: "app_staging_1234567890abcdef",
        action: "high-security-action",
        requests: [orbRequest, faceRequest, deviceRequest],
        actionDescription: "Verify your World ID",
        constraints: constraints,
        bridgeUrl: nil  // nil = use production bridge
    )

    print("📱 QR Code: \(session.connectUrl())\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Verified with \(proof.verificationLevel)")
}

/// Example: Face authentication
@available(macOS 12.0, iOS 15.0, *)
func verificationWithFaceAuth() async throws {
    // Request face authentication for extra security
    let signal = Signal.fromString(s: "sensitive_action_12345")
    let request = Request.new(credentialType: .orb, signal: signal)
        .withFaceAuth(faceAuth: true)

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "transfer-funds",
        requests: [request]
    )

    print("📱 QR Code: \(session.connectUrl())")
    print("🔐 Face authentication required\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Verified with face auth!")
}

/// Example: ABI-encoded signal for on-chain verification
@available(macOS 12.0, iOS 15.0, *)
func verificationWithAbiSignal() async throws {
    // For on-chain verification, the signal should be ABI-encoded
    let abiSignal = Signal.fromAbiEncoded(bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01
    ])

    let request = Request.new(credentialType: .orb, signal: abiSignal)

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "claim-airdrop",
        requests: [request]
    )

    print("📱 QR Code: \(session.connectUrl())\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Airdrop claimed! Proof ready for on-chain verification")
}

/// Example: Using Request convenience initializer (Swift sugar)
@available(macOS 12.0, iOS 15.0, *)
func verificationWithConvenience() async throws {
    // The Request+Extensions provides convenience for string signals
    let request = try Request(
        credentialType: .orb,
        signal: "user_action_12345",
        faceAuth: false
    )

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        requests: [request]
    )

    print("📱 QR Code: \(session.connectUrl())\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Verified!")
}

// Run the examples
@available(macOS 12.0, iOS 15.0, *)
@main
struct ExamplesRunner {
    static func main() async {
        print("IDKit Swift Examples")
        print("====================\n")

        do {
            // Uncomment the example you want to run:

            // try await basicVerification()
            // try await verificationWithStatusUpdates()
            // try await verificationWithLevel()
            // try await verificationWithConstraints()
            // try await verificationWithFaceAuth()
            // try await verificationWithAbiSignal()
            // try await verificationWithConvenience()

            print("\n✅ Example completed successfully!")
        } catch {
            print("\n❌ Error: \(error)")
        }
    }
}
