import Foundation
import IDKit

/// Example: Orb verification
///
/// This example demonstrates the simplest way to create a World ID verification session
/// and wait for a proof.
@available(macOS 12.0, iOS 15.0, *)
func basicVerification() async throws {
    // Step 1: Create a credential request
    let request = try Request(
        credentialType: .orb,
        signal: "user_action_12345"
    )

    // Step 2: Create a session
    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        requests: [request]
    )

    // Step 3: Display the QR code URL to the user
    print("📱 Scan this QR code in World App:")
    print(session.verificationURL)
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
    let request = try Request(credentialType: .orb, signal: "user_action_12345")
    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        requests: [request]
    )

    print("📱 QR Code URL: \(session.verificationURL)\n")

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

/// Example: Using credential categories
@available(macOS 12.0, iOS 15.0, *)
func verificationWithCategories() async throws {
    // Accept either personhood (Orb) or secure document
    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "verify-identity",
        credentialCategories: [.personhood, .secureDocument],
        signal: "user_12345",
        actionDescription: "Verify your identity to continue"
    )

    print("📱 QR Code: \(session.verificationURL)\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Verified with \(proof.verificationLevel)")
}

/// Example: Multiple requests with constraints
@available(macOS 12.0, iOS 15.0, *)
func verificationWithConstraints() async throws {
    // Create multiple requests
    let orbRequest = try Request(credentialType: .orb, signal: "signal_1")
    let faceRequest = try Request(credentialType: .face, signal: "signal_2")
    let deviceRequest = try Request(credentialType: .device, signal: "signal_3")

    // User must have at least one of: Orb, Face, or Device
    // Priority: Orb > Face > Device
    let constraints = try Constraints.any(.orb, .face, .device)

    let session = try Session.createWithOptions(
        appId: "app_staging_1234567890abcdef",
        action: "high-security-action",
        requests: [orbRequest, faceRequest, deviceRequest],
        actionDescription: "Verify your World ID",
        constraints: constraints,
        bridgeUrl: nil  // nil = use production bridge
    )

    print("📱 QR Code: \(session.verificationURL)\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Verified with \(proof.verificationLevel)")
}

/// Example: Face authentication
@available(macOS 12.0, iOS 15.0, *)
func verificationWithFaceAuth() async throws {
    // Request face authentication for extra security
    let request = try Request(
        credentialType: .orb,
        signal: "sensitive_action_12345",
        faceAuth: true
    )

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "transfer-funds",
        requests: [request]
    )

    print("📱 QR Code: \(session.verificationURL)")
    print("🔐 Face authentication required\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Verified with face auth!")
}

/// Example: Using verification level (simplified API)
@available(macOS 12.0, iOS 15.0, *)
func verificationWithLevel() async throws {
    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "login",
        verificationLevel: .orb,
        signal: "session_token_abc123"
    )

    print("📱 QR Code: \(session.verificationURL)\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Logged in! Nullifier: \(proof.nullifierHash)")
}

/// Example: ABI-encoded signal for on-chain verification
@available(macOS 12.0, iOS 15.0, *)
func verificationWithAbiSignal() async throws {
    // For on-chain verification, the signal should be ABI-encoded
    // This example shows a simple bytes array - in practice, use proper ABI encoding
    let abiSignal = Data([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01
    ])

    let request = try Request(
        credentialType: .orb,
        abiEncodedSignal: abiSignal
    )

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "claim-airdrop",
        requests: [request]
    )

    print("📱 QR Code: \(session.verificationURL)\n")

    let proof = try await session.waitForProofAsync()
    print("✅ Airdrop claimed! Proof ready for on-chain verification")
}

// Run the examples
@available(macOS 12.0, iOS 15.0, *)
@main
struct ExamplesRunner {
    static func main() async {
        print("IDKit Swift Examples\n")
        print("====================\n")

        do {
            // Uncomment the example you want to run:

            // try await basicVerification()
            // try await verificationWithStatusUpdates()
            // try await verificationWithCategories()
            // try await verificationWithConstraints()
            // try await verificationWithFaceAuth()
            // try await verificationWithLevel()
            // try await verificationWithAbiSignal()

            print("\n✅ Example completed successfully!")
        } catch {
            print("\n❌ Error: \(error)")
        }
    }
}
