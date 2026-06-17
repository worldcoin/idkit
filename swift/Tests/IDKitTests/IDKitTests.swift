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

private func sampleResult(sessionId: String? = nil, userPresenceCompleted: Bool = false) -> IDKitResult {
    IDKitResult(
        protocolVersion: "4.0",
        nonce: "0x1234",
        action: sessionId == nil ? "login" : nil,
        actionDescription: "Sample action",
        sessionId: sessionId,
        responses: [],
        userPresenceCompleted: userPresenceCompleted,
        environment: "production",
        identityAttested: nil,
        integrityBundle: nil
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

private func sampleRequestConfig() throws -> IDKitRequestConfig {
    return IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "login",
        rpContext: try sampleRpContext(),
        actionDescription: nil,
        bridgeUrl: nil,
        allowLegacyProofs: false,
        requireUserPresence: false,
        overrideConnectBaseUrl: nil,
        returnTo: nil,
        environment: nil,
        connectUrlMode: nil

    )
}

@Test("IDKit entrypoints expose canonical builders")
func idkitEntrypoints() throws {
    let requestConfig = sampleRequestConfig()

    // TODO: Re-enable when World ID 4.0 is live
    // let sessionConfig = IDKitSessionConfig(
    //     appId: "app_staging_1234567890abcdef",
    //     rpContext: try sampleRpContext(),
    //     actionDescription: nil,
    //     bridgeUrl: nil,
    //     requireUserPresence: false,
    //     overrideConnectBaseUrl: nil,
    //     returnTo: nil,
    //     environment: nil
    // )

    _ = IDKit.request(config: requestConfig)
    // TODO: Re-enable when World ID 4.0 is live
    // _ = IDKit.createSession(config: sessionConfig)
    // _ = IDKit.proveSession(sessionId: "0x01", config: sessionConfig)

    #expect(Bool(true))
}

@Test("bridge debug payload JSON exposes identity check contract fields")
func bridgeDebugPayloadJSONIdentityCheck() throws {
    let requestConfig = IDKitRequestConfig(
        appId: "app_staging_1234567890abcdef",
        action: "test-action",
        rpContext: try sampleRpContext(),
        actionDescription: "Identity check",
        bridgeUrl: nil,
        allowLegacyProofs: false,
        requireUserPresence: true,
        overrideConnectBaseUrl: nil,
        returnTo: "idkitsample://callback",
        environment: .staging,
        connectUrlMode: nil
    )

    let payloadJSON = try IDKit.bridgeDebugPayloadJSON(
        for: requestConfig,
        preset: identityCheck(
            attributes: [
                .minimumAge(21),
                .nationality("JPN")
            ]
        )
    )
    let payload = try #require(
        try JSONSerialization.jsonObject(with: Data(payloadJSON.utf8)) as? [String: Any]
    )

    #expect(payload["app_id"] as? String == "app_staging_1234567890abcdef")
    #expect(payload["action"] as? String == "test-action")
    #expect(payload["action_description"] as? String == "Identity check")
    #expect(payload["verification_level"] as? String == "document")
    #expect(payload["require_user_presence"] as? Bool == true)
    #expect(payload["allow_legacy_proofs"] as? Bool == true)
    #expect(payload["return_to_url"] as? String == "idkitsample://callback")
    #expect(payload["environment"] as? String == "staging")
    #expect(payload["timestamp"] == nil)

    let attributes = try #require(payload["identity_attributes"] as? [[String: Any]])
    #expect(attributes.count == 2)
    #expect(attributes[0]["type"] as? String == "minimum_age")
    #expect(attributes[0]["value"] as? Int == 21)
    #expect(attributes[1]["type"] as? String == "nationality")
    #expect(attributes[1]["value"] as? String == "JPN")

    let proofRequest = try #require(payload["proof_request"] as? [String: Any])
    #expect(proofRequest["proof_type"] as? String == "uniqueness")
    #expect(proofRequest["rp_id"] as? String == "rp_1234567890abcdef")
    #expect(proofRequest["created_at"] as? Int == 1_700_000_000)
    #expect(proofRequest["expires_at"] as? Int == 1_700_003_600)
    #expect(proofRequest["id"] is String)

    let proofRequests = try #require(proofRequest["proof_requests"] as? [[String: Any]])
    #expect(proofRequests.map { $0["identifier"] as? String } == ["passport", "mnc"])
}

@Test("Status mapping covers all canonical variants")
func statusMapping() {
    let result = sampleResult()

    #expect(IDKitRequest.mapStatus(.waitingForConnection) == .waitingForConnection)
    #expect(IDKitRequest.mapStatus(.awaitingConfirmation) == .awaitingConfirmation)
    #expect(IDKitRequest.mapStatus(.confirmed(result: result)) == .confirmed(result))
    #expect(IDKitRequest.mapStatus(.failed(error: .invalidNetwork)) == .failed(.invalidNetwork))
    #expect(IDKitRequest.mapStatus(.failed(error: .userPresenceFailed)) == .failed(.userPresenceFailed))
    #expect(IDKitRequest.mapStatus(.failed(error: .invalidRpSignature)) == .failed(.invalidRpSignature))
    #expect(IDKitRequest.mapStatus(.failed(error: .nullifierReplayed)) == .failed(.nullifierReplayed))
    #expect(IDKitRequest.mapStatus(.failed(error: .duplicateNonce)) == .failed(.duplicateNonce))
    #expect(IDKitRequest.mapStatus(.failed(error: .unknownRp)) == .failed(.unknownRp))
    #expect(IDKitRequest.mapStatus(.failed(error: .inactiveRp)) == .failed(.inactiveRp))
    #expect(IDKitRequest.mapStatus(.failed(error: .timestampTooOld)) == .failed(.timestampTooOld))
    #expect(IDKitRequest.mapStatus(.failed(error: .timestampTooFarInFuture)) == .failed(.timestampTooFarInFuture))
    #expect(IDKitRequest.mapStatus(.failed(error: .invalidTimestamp)) == .failed(.invalidTimestamp))
    #expect(IDKitRequest.mapStatus(.failed(error: .rpSignatureExpired)) == .failed(.rpSignatureExpired))
    #expect(IDKitRequest.mapStatus(.networkingError(error: .connectionFailed)) == .networkingError(.connectionFailed))
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

@Test("pollUntilCompletion recovers from networking errors")
func pollUntilCompletionNetworkingRecovery() async {
    let poller = StatusPoller([
        .waitingForConnection,
        .networkingError(.connectionFailed),
        .networkingError(.connectionFailed),
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

// TODO: Re-enable when World ID 4.0 is live
// @Test("CredentialRequest.create signal-only options")
// func credentialRequestOptionsSignalOnly() throws {
//     let request = try CredentialRequest.create(
//         .orb,
//         options: .init(signal: "user-123")
//     )
//
//     #expect(request.credentialType() == .orb)
//     #expect(String(data: request.getSignalBytes()!, encoding: .utf8) == "user-123")
//     #expect(request.genesisIssuedAtMin() == nil)
//     #expect(request.expiresAtMin() == nil)
// }

// @Test("CredentialRequest.create genesis-only options")
// func credentialRequestOptionsGenesisOnly() throws {
//     let request = try CredentialRequest.create(
//         .orb,
//         options: .init(genesisIssuedAtMin: 1_700_000_000)
//     )
//
//     #expect(request.genesisIssuedAtMin() == 1_700_000_000)
//     #expect(request.expiresAtMin() == nil)
// }

// @Test("CredentialRequest.create expiry-only options")
// func credentialRequestOptionsExpiryOnly() throws {
//     let request = try CredentialRequest.create(
//         .orb,
//         options: .init(expiresAtMin: 1_800_000_000)
//     )
//
//     #expect(request.genesisIssuedAtMin() == nil)
//     #expect(request.expiresAtMin() == 1_800_000_000)
// }

// @Test("CredentialRequest.create combined options")
// func credentialRequestOptionsCombined() throws {
//     let request = try CredentialRequest.create(
//         .orb,
//         options: .init(signal: "user-123", genesisIssuedAtMin: 1_700_000_000, expiresAtMin: 1_800_000_000)
//     )
//
//     #expect(request.credentialType() == .orb)
//     #expect(String(data: request.getSignalBytes()!, encoding: .utf8) == "user-123")
//     #expect(request.genesisIssuedAtMin() == 1_700_000_000)
//     #expect(request.expiresAtMin() == 1_800_000_000)
// }

@Test("Legacy preset helpers remain available")
func legacyPresetHelpers() {
    let orb = orbLegacy(signal: "x")
    let secureDoc = secureDocumentLegacy(signal: "y")
    let doc = documentLegacy(signal: "z")
    let device = deviceLegacy(signal: "d")
    let face = selfieCheckLegacy(signal: "f")
    let identity = identityCheck(
        attributes: [
            .minimumAge(21),
            .nationality("JPN"),
            .documentType(.passport)
        ]
    )

    switch orb {
    case .orbLegacy(let signal):
        #expect(signal == "x")
    case .secureDocumentLegacy, .documentLegacy, .deviceLegacy, .selfieCheckLegacy,
         .identityCheck, .proofOfHuman, .passport, .mnc:
        Issue.record("Expected orbLegacy preset")
    }

    switch secureDoc {
    case .secureDocumentLegacy(let signal):
        #expect(signal == "y")
    case .orbLegacy, .documentLegacy, .deviceLegacy, .selfieCheckLegacy,
         .identityCheck, .proofOfHuman, .passport, .mnc:
        Issue.record("Expected secureDocumentLegacy preset")
    }

    switch doc {
    case .documentLegacy(let signal):
        #expect(signal == "z")
    case .orbLegacy, .secureDocumentLegacy, .deviceLegacy, .selfieCheckLegacy,
         .identityCheck, .proofOfHuman, .passport, .mnc:
        Issue.record("Expected documentLegacy preset")
    }

    switch device {
    case .deviceLegacy(let signal):
        #expect(signal == "d")
    case .orbLegacy, .secureDocumentLegacy, .documentLegacy, .selfieCheckLegacy,
         .identityCheck, .proofOfHuman, .passport, .mnc:
        Issue.record("Expected deviceLegacy preset")
    }

    switch face {
    case .selfieCheckLegacy(let signal):
        #expect(signal == "f")
    case .orbLegacy, .secureDocumentLegacy, .documentLegacy, .deviceLegacy,
         .identityCheck, .proofOfHuman, .passport, .mnc:
        Issue.record("Expected selfieCheckLegacy preset")
    }

    switch identity {
    case let .identityCheck(attributes: attributes, legacySignal: legacySignal):
        let expected: [IdentityAttribute] = [
            .minimumAge(21),
            .nationality("JPN"),
            .documentType(.passport)
        ]
        #expect(attributes == expected)
        #expect(legacySignal == nil)
    case .orbLegacy, .secureDocumentLegacy, .documentLegacy, .deviceLegacy, .selfieCheckLegacy,
         .proofOfHuman, .passport, .mnc:
        Issue.record("Expected identityCheck preset")
    }

    let identityWithSignal = identityCheck(
        attributes: [.minimumAge(18)],
        legacySignal: "my-signal"
    )
    switch identityWithSignal {
    case let .identityCheck(attributes: _, legacySignal: legacySignal):
        #expect(legacySignal == "my-signal")
    case .orbLegacy, .secureDocumentLegacy, .documentLegacy, .deviceLegacy, .selfieCheckLegacy,
         .proofOfHuman, .passport, .mnc:
        Issue.record("Expected identityCheck preset with signal")
    }
}

// TODO: Re-enable when World ID 4.0 is live
// @Test("enumerateOf helper serializes canonical enumerate constraint")
// func enumerateConstraintHelperSerialization() throws {
//     let secureDocument = CredentialRequest.create(.secureDocument)
//     let document = CredentialRequest.create(.document)
//     let constraint = enumerateOf(secureDocument, document)
//
//     let json = try constraint.toJson()
//     #expect(json.contains("\"enumerate\""))
// }
