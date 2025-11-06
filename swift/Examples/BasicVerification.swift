import Foundation
import IDKit

private enum ExampleError: Error {
    case verificationFailed(String)
}

/// Example: Basic Orb verification using the UniFFI API
@available(macOS 12.0, iOS 15.0, *)
func basicVerification() async throws {
    let signal = Signal.fromString(s: "user_action_12345")
    let request = Request(credentialType: .orb, signal: signal)

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        requests: [request]
    )

    print("📱 Scan this QR code in World App:")
    print(session.connectUrl())
    print()

    print("⏳ Waiting for verification...")

    for try await status in session.status() {
        switch status {
        case .waitingForConnection:
            print("⏳ Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("📱 User scanned code! Awaiting confirmation in World App...")
        case .confirmed(let proof):
            print("✅ Verification successful!")
            print("   Nullifier Hash: \(proof.nullifierHash)")
            print("   Merkle Root: \(proof.merkleRoot)")
            print("   Verification Level: \(proof.verificationLevel)")
            return
        case .failed(let error):
            throw ExampleError.verificationFailed(error)
        }
    }

    throw ExampleError.verificationFailed("Stream ended without terminal status")
}

/// Example: Manually polling for status updates.
@available(macOS 12.0, iOS 15.0, *)
func verificationWithStatusUpdates() async throws {
    let signal = Signal.fromString(s: "user_action_12345")
    let request = Request(credentialType: .orb, signal: signal)

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        requests: [request]
    )

    print("📱 QR Code URL: \(session.connectUrl())\n")

    for try await status in session.status() {
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
            throw ExampleError.verificationFailed(error)
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

    for try await status in session.status() {
        switch status {
        case .waitingForConnection:
            print("⏳ Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("📱 User scanned code! Awaiting confirmation...")
        case .confirmed(let proof):
            print("✅ Logged in! Nullifier: \(proof.nullifierHash)")
            return
        case .failed(let error):
            throw ExampleError.verificationFailed(error)
        }
    }

    throw ExampleError.verificationFailed("Stream ended without terminal status")
}

/// Example: Multiple requests with constraints
@available(macOS 12.0, iOS 15.0, *)
func verificationWithConstraints() async throws {
    let signal = Signal.fromString(s: "user_signal")
    let orbRequest = Request(credentialType: .orb, signal: signal)
    let faceRequest = Request(credentialType: .face, signal: signal)
    let deviceRequest = Request(credentialType: .device, signal: signal)

    let constraints = Constraints.any(credentials: [.orb, .face, .device])

    let session = try Session.createWithOptions(
        appId: "app_staging_1234567890abcdef",
        action: "high-security-action",
        requests: [orbRequest, faceRequest, deviceRequest],
        actionDescription: "Verify your World ID",
        constraints: constraints,
        bridgeUrl: nil
    )

    print("📱 QR Code: \(session.connectUrl())\n")

    for try await status in session.status() {
        switch status {
        case .waitingForConnection:
            print("⏳ Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("📱 Awaiting confirmation...")
        case .confirmed(let proof):
            print("✅ Verified with \(proof.verificationLevel)")
            return
        case .failed(let error):
            throw ExampleError.verificationFailed(error)
        }
    }

    throw ExampleError.verificationFailed("Stream ended without terminal status")
}

/// Example: Face authentication
@available(macOS 12.0, iOS 15.0, *)
func verificationWithFaceAuth() async throws {
    let signal = Signal.fromString(s: "sensitive_action_12345")
    let request = Request(credentialType: .orb, signal: signal)
        .withFaceAuth(faceAuth: true)

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "transfer-funds",
        requests: [request]
    )

    print("📱 QR Code: \(session.connectUrl())")
    print("🔐 Face authentication required\n")

    for try await status in session.status() {
        switch status {
        case .waitingForConnection:
            print("⏳ Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("📱 Awaiting confirmation with face auth...")
        case .confirmed:
            print("✅ Verified with face auth!")
            return
        case .failed(let error):
            throw ExampleError.verificationFailed(error)
        }
    }

    throw ExampleError.verificationFailed("Stream ended without terminal status")
}

/// Example: ABI-encoded signal for on-chain verification
@available(macOS 12.0, iOS 15.0, *)
func verificationWithAbiSignal() async throws {
    let abiSignal = Signal.fromAbiEncoded(bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01
    ])

    let request = Request(credentialType: .orb, signal: abiSignal)

    let session = try Session.create(
        appId: "app_staging_1234567890abcdef",
        action: "claim-airdrop",
        requests: [request]
    )

    print("📱 QR Code: \(session.connectUrl())\n")

    for try await status in session.status() {
        switch status {
        case .waitingForConnection:
            print("⏳ Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("📱 Awaiting confirmation...")
        case .confirmed:
            print("✅ Airdrop claimed! Proof ready for on-chain verification")
            return
        case .failed(let error):
            throw ExampleError.verificationFailed(error)
        }
    }

    throw ExampleError.verificationFailed("Stream ended without terminal status")
}

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

            print("\n✅ Example completed successfully!")
        } catch {
            print("\n❌ Error: \(error)")
        }
    }
}
