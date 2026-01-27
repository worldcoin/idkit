import Foundation
import IDKit

private enum ExampleError: Error {
    case verificationFailed(String)
}

// Helper to create a mock RpContext for examples
// In production, this should come from your backend using computeRpSignature
private func createMockRpContext() throws -> RpContext {
    try RpContext(
        rpId: "rp_1234567890abcdef",
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
        createdAt: UInt64(Date().timeIntervalSince1970),
        expiresAt: UInt64(Date().timeIntervalSince1970) + 3600,
        signature: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    )
}

/// Example: Basic Orb verification using the IDKit.request() API
@available(macOS 12.0, iOS 15.0, *)
func basicVerification() async throws {
    let rpContext = try createMockRpContext()

    let config = IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        rpContext: rpContext,
        actionDescription: nil,
        bridgeUrl: nil
    )

    let request = try IDKit.request(config: config)
        .constraints(constraints: anyOf(CredentialRequest.create(.orb, signal: "user_action_12345")))

    print("Scan this QR code in World App:")
    print(request.connectUrl())
    print()

    print("Waiting for verification...")

    for try await status in request.status() {
        switch status {
        case .waitingForConnection:
            print("Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("User scanned code! Awaiting confirmation in World App...")
        case .confirmed(let proof):
            print("Verification successful!")
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
    let rpContext = try createMockRpContext()

    let config = IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        rpContext: rpContext,
        actionDescription: nil,
        bridgeUrl: nil
    )

    let request = try IDKit.request(config: config)
        .constraints(constraints: anyOf(CredentialRequest.create(.orb, signal: "user_action_12345")))

    print("QR Code URL: \(request.connectUrl())\n")

    for try await status in request.status() {
        switch status {
        case .waitingForConnection:
            print("Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("User scanned code! Awaiting confirmation in World App...")
        case .confirmed(let proof):
            print("Verification complete!")
            print("   Proof: \(proof.proof.prefix(64))...")
            return
        case .failed(let error):
            throw ExampleError.verificationFailed(error)
        }
    }
}

/// Example: Simple Orb verification (convenience pattern)
@available(macOS 12.0, iOS 15.0, *)
func verificationSimple() async throws {
    let rpContext = try createMockRpContext()

    let config = IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "login",
        rpContext: rpContext,
        actionDescription: nil,
        bridgeUrl: nil
    )

    let request = try IDKit.request(config: config)
        .constraints(constraints: anyOf(CredentialRequest.create(.orb, signal: "session_token_abc123")))

    print("QR Code: \(request.connectUrl())\n")

    for try await status in request.status() {
        switch status {
        case .waitingForConnection:
            print("Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("User scanned code! Awaiting confirmation...")
        case .confirmed(let proof):
            print("Logged in! Nullifier: \(proof.nullifierHash)")
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
    let rpContext = try createMockRpContext()

    let config = IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "high-security-action",
        rpContext: rpContext,
        actionDescription: "Verify your World ID",
        bridgeUrl: nil
    )

    // User must have at least one of these credentials
    let request = try IDKit.request(config: config)
        .constraints(constraints: anyOf(
            CredentialRequest.create(.orb, signal: "user_signal"),
            CredentialRequest.create(.face, signal: "user_signal"),
            CredentialRequest.create(.device, signal: "user_signal")
        ))

    print("QR Code: \(request.connectUrl())\n")

    for try await status in request.status() {
        switch status {
        case .waitingForConnection:
            print("Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("Awaiting confirmation...")
        case .confirmed(let proof):
            print("Verified with \(proof.verificationLevel)")
            return
        case .failed(let error):
            throw ExampleError.verificationFailed(error)
        }
    }

    throw ExampleError.verificationFailed("Stream ended without terminal status")
}

/// Example: Using orbLegacy preset for World ID 3.0 compatibility
@available(macOS 12.0, iOS 15.0, *)
func verificationWithOrbLegacyPreset() async throws {
    let rpContext = try createMockRpContext()

    let config = IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "transfer-funds",
        rpContext: rpContext,
        actionDescription: nil,
        bridgeUrl: nil
    )

    // Use orbLegacy preset for backward compatibility
    let request = try IDKit.request(config: config)
        .preset(preset: orbLegacy(signal: "sensitive_action_12345"))

    print("QR Code: \(request.connectUrl())")
    print("Using orbLegacy preset for WID 3.0 compatibility\n")

    for try await status in request.status() {
        switch status {
        case .waitingForConnection:
            print("Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("Awaiting confirmation...")
        case .confirmed:
            print("Verified!")
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
    let rpContext = try createMockRpContext()

    let config = IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "claim-airdrop",
        rpContext: rpContext,
        actionDescription: nil,
        bridgeUrl: nil
    )

    // Note: For ABI-encoded signals, you would create a CredentialRequest with the signal
    let request = try IDKit.request(config: config)
        .constraints(constraints: anyOf(CredentialRequest.create(.orb, signal: "airdrop_claim_001")))

    print("QR Code: \(request.connectUrl())\n")

    for try await status in request.status() {
        switch status {
        case .waitingForConnection:
            print("Waiting for user to scan QR code...")
        case .awaitingConfirmation:
            print("Awaiting confirmation...")
        case .confirmed:
            print("Airdrop claimed! Proof ready for on-chain verification")
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
            // try await verificationSimple()
            // try await verificationWithConstraints()
            // try await verificationWithOrbLegacyPreset()
            // try await verificationWithAbiSignal()

            print("\nExample completed successfully!")
        } catch {
            print("\nError: \(error)")
        }
    }
}
