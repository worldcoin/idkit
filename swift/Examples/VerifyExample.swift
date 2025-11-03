import Foundation
import IDKit

/// Example demonstrating World ID verification with IDKit Swift bindings
@main
struct VerifyExample {
    static func main() async throws {
        // Initialize IDKit
        init()

        print("IDKit Swift Example - World ID Verification")
        print("=" * 50)

        // Example 1: API with verification level
        print("\n1. Creating session with verification level")
        let session1 = try IdkitSession.fromVerificationLevel(
            appId: "app_staging_1234567890abcdef",
            action: "verify-human",
            verificationLevel: .orb,
            signal: "user_12345"
        )

        let connectUrl = session1.connectUrl()
        print("   Connect URL: \(connectUrl)")
        print("   Scan this QR code with World App to verify")

        // Example 2: API with credential requests
        print("\n2. Creating session with credential requests")
        let requests = [
            RequestConfig(
                credentialType: .orb,
                signal: "user_12345",
                faceAuth: nil
            )
        ]

        let session2 = try IdkitSession.withRequests(
            appId: "app_staging_1234567890abcdef",
            action: "verify-human",
            requests: requests
        )

        print("   Connect URL: \(session2.connectUrl())")

        // Example 3: Poll for status
        print("\n3. Polling for verification status...")
        var attempts = 0
        let maxAttempts = 5

        while attempts < maxAttempts {
            let status = try session2.poll()

            switch status {
            case .waitingForConnection:
                print("   Status: Waiting for user to scan QR code...")
            case .awaitingConfirmation:
                print("   Status: Waiting for user confirmation...")
            case .confirmed(let proof):
                print("   Status: Verified!")
                print("   Proof: \(proof.proof.prefix(20))...")
                print("   Merkle Root: \(proof.merkleRoot)")
                print("   Nullifier Hash: \(proof.nullifierHash)")
                print("   Verification Level: \(proof.verificationLevel)")
                return
            case .failed(let error):
                print("   Status: Failed - \(error)")
                return
            }

            attempts += 1
            try await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
        }

        print("\n   Polling timed out, but you can continue polling or use waitForProof()")

        // Example 4: Wait for proof with timeout (blocking)
        print("\n4. Waiting for proof (alternative approach)...")
        print("   Note: In a real app, you'd use one approach or the other, not both")

        do {
            let proof = try session2.waitForProof(timeoutMs: 120_000) // 2 minute timeout
            print("   Proof received!")
            print("   Merkle Root: \(proof.merkleRoot)")
            print("   Nullifier Hash: \(proof.nullifierHash)")
        } catch let error as IdkitError {
            switch error {
            case .timeout:
                print("   Verification timed out")
            case .networkError(let msg):
                print("   Network error: \(msg)")
            case .appError(let msg):
                print("   App error: \(msg)")
            default:
                print("   Error: \(error)")
            }
        }

        print("\n" + "=" * 50)
        print("Example complete!")
    }
}

// Helper to repeat a string
extension String {
    static func *(lhs: String, rhs: Int) -> String {
        return String(repeating: lhs, count: rhs)
    }
}
