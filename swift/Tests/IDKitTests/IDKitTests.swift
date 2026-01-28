import Foundation
import Testing
@testable import IDKit

// MARK: - CredentialRequest Tests

@Test("CredentialRequest creation with signal via UniFFI init")
func credentialRequestCreationWithSignal() throws {
    let signal = Signal.fromString(s: "test_signal")
    // Use the UniFFI-generated initializer directly
    let item = CredentialRequest(credentialType: .orb, signal: signal)

    #expect(item.credentialType() == .orb)
    #expect(item.getSignalBytes() != nil)
}

@Test("CredentialRequest creation without signal via UniFFI init")
func credentialRequestCreationWithoutSignal() {
    // Use the UniFFI-generated initializer directly
    let item = CredentialRequest(credentialType: .device, signal: nil)

    #expect(item.credentialType() == .device)
    #expect(item.getSignalBytes() == nil)
}

@Test("CredentialRequest.create convenience method")
func credentialRequestConvenience() {
    let item = CredentialRequest.create(.orb, signal: "test-signal")

    #expect(item.credentialType() == .orb)
}

// MARK: - Signal Tests

@Test("Signal from string")
func signalFromString() {
    let signal = Signal.fromString(s: "test_signal")

    #expect(signal.asString() == "test_signal")
    #expect(String(data: signal.bytesData, encoding: .utf8) == "test_signal")
}

@Test("Signal from ABI-encoded bytes")
func signalFromAbiEncoded() {
    let bytes = Data([0x00, 0x01, 0x02, 0x03])
    let signal = Signal.fromAbiEncoded(bytes: bytes)

    #expect(signal.bytesData == Data(bytes))
    #expect(signal.asString() == nil)  // Not a valid UTF-8 string
}

@Test("Signal bytesData property")
func signalBytesDataProperty() {
    let signal = Signal.fromString(s: "test")
    let data = signal.bytesData

    #expect(String(data: data, encoding: .utf8) == "test")
}

@Test("Signal stringValue property")
func signalStringValueProperty() {
    let signal = Signal.fromString(s: "hello")

    #expect(signal.stringValue == "hello")
}

// MARK: - CredentialType Tests

@Test("All credential types are available")
func credentialTypeExists() {
    // Test that all credential types are available from Rust
    let types: [CredentialType] = [.orb, .face, .device, .secureDocument, .document]

    #expect(types.count == 5)
}

// MARK: - VerificationLevel Tests

@Test("All verification levels are available")
func verificationLevelExists() {
    // Test that all verification levels are available from Rust
    let levels: [VerificationLevel] = [.orb, .face, .device, .secureDocument, .document, .deprecated]

    #expect(levels.count == 6)
}

// MARK: - ConstraintNode Tests

@Test("ConstraintNode item leaf")
func constraintNodeItem() throws {
    let item = CredentialRequest.create(.orb)
    let node = ConstraintNode.item(request: item)

    let json = try node.toJson()
    #expect(!json.isEmpty)
}

@Test("ConstraintNode with ANY operator")
func constraintNodeAny() throws {
    let orb = ConstraintNode.item(request: CredentialRequest.create(.orb))
    let face = ConstraintNode.item(request: CredentialRequest.create(.face))

    let anyNode = ConstraintNode.any(nodes: [orb, face])

    let json = try anyNode.toJson()
    #expect(!json.isEmpty)
}

@Test("ConstraintNode with ALL operator")
func constraintNodeAll() throws {
    let orb = ConstraintNode.item(request: CredentialRequest.create(.orb))
    let doc = ConstraintNode.item(request: CredentialRequest.create(.secureDocument))

    let allNode = ConstraintNode.all(nodes: [orb, doc])

    let json = try allNode.toJson()
    #expect(!json.isEmpty)
}

@Test("anyOf convenience function")
func anyOfConvenience() throws {
    let constraint = anyOf(CredentialRequest.create(.orb), CredentialRequest.create(.face))

    let json = try constraint.toJson()
    #expect(!json.isEmpty)
}

@Test("allOf convenience function")
func allOfConvenience() throws {
    let constraint = allOf(CredentialRequest.create(.orb), CredentialRequest.create(.document))

    let json = try constraint.toJson()
    #expect(!json.isEmpty)
}

// MARK: - IDKitRequest Creation Tests
// Note: These tests verify API shape, actual requests need valid credentials

@Test("request() builder API shape")
func requestBuilderAPIShape() {
    // Create a test RpContext (in production this would come from your backend)
    // Note: RpId must be "rp_" followed by exactly 16 hex characters
    let rpContext = try! RpContext(
        rpId: "rp_1234567890abcdef",
        nonce: "test-nonce",
        createdAt: UInt64(Date().timeIntervalSince1970),
        expiresAt: UInt64(Date().timeIntervalSince1970) + 3600,
        signature: "test-signature"
    )

    let config = IDKitRequestConfig(
        appId: "app_test_invalid",
        action: "test",
        rpContext: rpContext,
        actionDescription: nil,
        bridgeUrl: nil
    )

    // This will throw without valid credentials - verify API exists
    let builder = IDKit.request(config: config)
    _ = try? builder.constraints(constraints: anyOf(CredentialRequest.create(.orb)))

    // If we reach here without crashing, the API exists
    #expect(Bool(true))
}

@Test("orbLegacy preset helper")
func orbLegacyPresetHelper() {
    let preset = orbLegacy(signal: "test-signal")

    // Verify the preset was created
    switch preset {
    case .orbLegacy(let data):
        #expect(data.signal == "test-signal")
    }
}

@Test("request().preset() API shape")
func requestPresetAPIShape() {
    let rpContext = try! RpContext(
        rpId: "rp_1234567890abcdef",
        nonce: "test-nonce",
        createdAt: UInt64(Date().timeIntervalSince1970),
        expiresAt: UInt64(Date().timeIntervalSince1970) + 3600,
        signature: "test-signature"
    )

    let config = IDKitRequestConfig(
        appId: "app_test_invalid",
        action: "test",
        rpContext: rpContext,
        actionDescription: nil,
        bridgeUrl: nil
    )

    // This will throw without valid credentials - verify API exists
    let builder = IDKit.request(config: config)
    _ = try? builder.preset(preset: orbLegacy())

    // If we reach here without crashing, the API exists
    #expect(Bool(true))
}

// MARK: - SDK Version Test

// TODO: Re-enable this test once linker issue is resolved
// @Test("SDK version is valid")
// func sdkVersion() {
//     #expect(!IDKit.version.isEmpty)
//     #expect(IDKit.version.hasPrefix("3."))
// }

// MARK: - Proof Tests

@Test("Proof serialization roundtrip")
func proofSerialization() throws {
    let proof = Proof(
        proof: "0x123",
        merkleRoot: "0x456",
        nullifierHash: "0x789",
        verificationLevel: .orb
    )

    let json = try proofToJson(proof: proof)
    let parsed = try proofFromJson(json: json)

    #expect(parsed.proof == "0x123")
    #expect(parsed.merkleRoot == "0x456")
    #expect(parsed.nullifierHash == "0x789")
    #expect(parsed.verificationLevel == .orb)
}

// MARK: - Swift Extensions Tests

@Suite("Swift Extension Convenience APIs")
struct SwiftExtensionsTests {

    @Test("CredentialRequest.create with string signal")
    func credentialRequestConvenienceWithString() {
        let item = CredentialRequest.create(.orb, signal: "test_signal")

        #expect(item.credentialType() == .orb)
        #expect(item.getSignalBytes() != nil)
    }

    @Test("CredentialRequest.create without signal")
    func credentialRequestConvenienceWithoutSignal() {
        let item = CredentialRequest.create(.face)

        #expect(item.credentialType() == .face)
        #expect(item.getSignalBytes() == nil)
    }

    @Test("Signal convenience properties")
    func signalConvenienceProperties() {
        let signal = Signal.fromString(s: "test_signal")

        // Test Swift extension properties
        #expect(signal.stringValue == "test_signal")
        #expect(signal.bytesData == Data("test_signal".utf8))
    }
}
