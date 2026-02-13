import Foundation
import Testing
@testable import IDKit

private actor StatusPoller {
    private var queue: [IDKitStatus]

    init(_ queue: [IDKitStatus]) {
        self.queue = queue
    }

    func next() -> IDKitStatus {
        if queue.isEmpty {
            return .waitingForConnection
        }
        return queue.removeFirst()
    }
}

private func sampleResult(sessionId: String? = nil) -> IDKitResult {
    IDKitResult(
        protocolVersion: "4.0",
        nonce: "0x1234",
        action: sessionId == nil ? "login" : nil,
        actionDescription: "Sample action",
        sessionId: sessionId,
        responses: [],
        environment: "production"
    )
}

private func sampleRpContext() throws -> RpContext {
    let signature = "0x" + String(repeating: "00", count: 64) + "1b"
    return try RpContext(
        rpId: "rp_1234567890abcdef",
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
        createdAt: 1_700_000_000,
        expiresAt: 1_700_003_600,
        signature: signature
    )
}

@Test("IDKit entrypoints expose canonical builders")
func idkitEntrypoints() throws {
    let requestConfig = IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "login",
        rpContext: try sampleRpContext(),
        actionDescription: nil,
        bridgeUrl: nil,
        allowLegacyProofs: false,
        overrideConnectBaseUrl: nil,
        environment: nil
    )

    let sessionConfig = IDKitSessionConfig(
        appId: "app_staging_1234567890abcdef",
        rpContext: try sampleRpContext(),
        actionDescription: nil,
        bridgeUrl: nil,
        overrideConnectBaseUrl: nil,
        environment: nil
    )

    _ = IDKit.request(config: requestConfig)
    _ = IDKit.createSession(config: sessionConfig)
    _ = IDKit.proveSession(sessionId: "0x01", config: sessionConfig)

    #expect(Bool(true))
}

@Test("Status mapping covers all canonical variants")
func statusMapping() {
    let result = sampleResult()

    #expect(IDKitRequest.mapStatus(.waitingForConnection) == .waitingForConnection)
    #expect(IDKitRequest.mapStatus(.awaitingConfirmation) == .awaitingConfirmation)
    #expect(IDKitRequest.mapStatus(.confirmed(result: result)) == .confirmed(result))
    #expect(IDKitRequest.mapStatus(.failed(error: .invalidNetwork)) == .failed(.invalidNetwork))
}

@Test("pollUntilCompletion success path")
func pollUntilCompletionSuccess() async {
    let poller = StatusPoller([
        .waitingForConnection,
        .awaitingConfirmation,
        .confirmed(sampleResult())
    ])

    let request = IDKitRequest(
        connectorURL: URL(string: "https://world.org/verify?t=wld")!,
        requestID: UUID(),
        pollOnce: { await poller.next() }
    )

    let completion = await request.pollUntilCompletion(options: .init(pollIntervalMs: 1, timeoutMs: 1_000))
    #expect(completion == .success(sampleResult()))
}

@Test("pollUntilCompletion timeout path")
func pollUntilCompletionTimeout() async {
    let request = IDKitRequest(
        connectorURL: URL(string: "https://world.org/verify?t=wld")!,
        requestID: UUID(),
        pollOnce: { .waitingForConnection }
    )

    let completion = await request.pollUntilCompletion(options: .init(pollIntervalMs: 5, timeoutMs: 20))
    #expect(completion == .failure(.timeout))
}

@Test("pollUntilCompletion cancellation path")
func pollUntilCompletionCancellation() async {
    let request = IDKitRequest(
        connectorURL: URL(string: "https://world.org/verify?t=wld")!,
        requestID: UUID(),
        pollOnce: { .waitingForConnection }
    )

    let task = Task {
        await request.pollUntilCompletion(options: .init(pollIntervalMs: 100, timeoutMs: 10_000))
    }
    task.cancel()

    let completion = await task.value
    #expect(completion == .failure(.cancelled))
}

@Test("pollUntilCompletion app failure path")
func pollUntilCompletionAppFailure() async {
    let request = IDKitRequest(
        connectorURL: URL(string: "https://world.org/verify?t=wld")!,
        requestID: UUID(),
        pollOnce: { .failed(.userRejected) }
    )

    let completion = await request.pollUntilCompletion(options: .init(pollIntervalMs: 1, timeoutMs: 1_000))
    #expect(completion == .failure(.userRejected))
}

@Test("hashSignal string and data overloads are deterministic")
func hashSignalOverloads() {
    let raw = "test-signal"
    let hashFromString = IDKit.hashSignal(raw)
    let hashFromData = IDKit.hashSignal(Data(raw.utf8))

    #expect(hashFromString == hashFromData)
    #expect(hashFromString.hasPrefix("0x"))
    #expect(!hashFromString.isEmpty)
}

@Test("CredentialRequest.create signal-only options")
func credentialRequestOptionsSignalOnly() throws {
    let request = try CredentialRequest.create(
        .orb,
        options: .init(signal: "user-123")
    )

    #expect(request.credentialType() == .orb)
    #expect(String(data: request.getSignalBytes()!, encoding: .utf8) == "user-123")
    #expect(request.genesisIssuedAtMin() == nil)
    #expect(request.expiresAtMin() == nil)
}

@Test("CredentialRequest.create genesis-only options")
func credentialRequestOptionsGenesisOnly() throws {
    let request = try CredentialRequest.create(
        .orb,
        options: .init(genesisIssuedAtMin: 1_700_000_000)
    )

    #expect(request.genesisIssuedAtMin() == 1_700_000_000)
    #expect(request.expiresAtMin() == nil)
}

@Test("CredentialRequest.create expiry-only options")
func credentialRequestOptionsExpiryOnly() throws {
    let request = try CredentialRequest.create(
        .orb,
        options: .init(expiresAtMin: 1_800_000_000)
    )

    #expect(request.genesisIssuedAtMin() == nil)
    #expect(request.expiresAtMin() == 1_800_000_000)
}

@Test("CredentialRequest.create combined options")
func credentialRequestOptionsCombined() throws {
    let request = try CredentialRequest.create(
        .orb,
        options: .init(signal: "user-123", genesisIssuedAtMin: 1_700_000_000, expiresAtMin: 1_800_000_000)
    )

    #expect(request.credentialType() == .orb)
    #expect(String(data: request.getSignalBytes()!, encoding: .utf8) == "user-123")
    #expect(request.genesisIssuedAtMin() == 1_700_000_000)
    #expect(request.expiresAtMin() == 1_800_000_000)
}

@Test("Legacy preset helpers remain available")
func legacyPresetHelpers() {
    let orb = orbLegacy(signal: "x")
    let secureDoc = secureDocumentLegacy(signal: "y")
    let doc = documentLegacy(signal: "z")

    switch orb {
    case .orbLegacy(let signal):
        #expect(signal == "x")
    case .secureDocumentLegacy, .documentLegacy:
        Issue.record("Expected orbLegacy preset")
    }

    switch secureDoc {
    case .secureDocumentLegacy(let signal):
        #expect(signal == "y")
    case .orbLegacy, .documentLegacy:
        Issue.record("Expected secureDocumentLegacy preset")
    }

    switch doc {
    case .documentLegacy(let signal):
        #expect(signal == "z")
    case .orbLegacy, .secureDocumentLegacy:
        Issue.record("Expected documentLegacy preset")
    }
}
