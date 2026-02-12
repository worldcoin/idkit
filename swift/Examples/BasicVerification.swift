import Foundation
import IDKit

private enum ExampleError: Error {
    case verificationFailed(IDKitErrorCode)
}

private func createMockRpContext() throws -> RpContext {
    let signature = "0x" + String(repeating: "00", count: 64) + "1b"
    return try RpContext(
        rpId: "rp_1234567890abcdef",
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
        createdAt: UInt64(Date().timeIntervalSince1970),
        expiresAt: UInt64(Date().timeIntervalSince1970) + 3600,
        signature: signature
    )
}

@available(macOS 12.0, iOS 15.0, *)
func basicVerification() async throws {
    let rpContext = try createMockRpContext()

    let config = IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "vote",
        rpContext: rpContext,
        actionDescription: "Example verification",
        bridgeUrl: nil,
        allowLegacyProofs: false,
        overrideConnectBaseUrl: nil,
        environment: .staging
    )

    let request = try IDKit
        .request(config: config)
        .preset(orbLegacy(signal: "user_action_12345"))

    print("Connector URL: \(request.connectorURL)")

    let completion = await request.pollUntilCompletion(
        options: .init(pollIntervalMs: 1_000, timeoutMs: 120_000)
    )

    switch completion {
    case .success(let result):
        print("Verification successful. protocol_version=\(result.protocolVersion)")
    case .failure(let error):
        throw ExampleError.verificationFailed(error)
    }
}

@available(macOS 12.0, iOS 15.0, *)
@main
struct ExamplesRunner {
    static func main() async {
        do {
            try await basicVerification()
        } catch {
            print("Error: \(error)")
        }
    }
}
