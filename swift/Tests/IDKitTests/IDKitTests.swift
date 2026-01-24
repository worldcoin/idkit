import Foundation
import Testing
@testable import IDKit

// MARK: - RequestItem Tests

@Test("RequestItem creation with signal via UniFFI")
func requestItemCreationWithSignal() throws {
    let signal = Signal.fromString(s: "test_signal")
    // Use the UniFFI-generated static method directly
    let item = RequestItem.new(credentialType: .orb, signal: signal)

    #expect(item.credentialType == .orb)
    #expect(item.signal != nil)
}

@Test("RequestItem creation without signal via UniFFI")
func requestItemCreationWithoutSignal() {
    // Use the UniFFI-generated static method directly
    let item = RequestItem.new(credentialType: .device, signal: nil)

    #expect(item.credentialType == .device)
    #expect(item.signal == nil)
}

@Test("RequestItem convenience function")
func requestItemConvenience() {
    let item = RequestItem(.orb, signal: "test-signal")

    #expect(item.credentialType == .orb)
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
    let item = RequestItem(.orb)
    let node = ConstraintNode.item(request: item)

    let json = try node.toJson()
    #expect(!json.isEmpty)
}

@Test("ConstraintNode with ANY operator")
func constraintNodeAny() throws {
    let orb = ConstraintNode.item(request: RequestItem(.orb))
    let face = ConstraintNode.item(request: RequestItem(.face))

    let anyNode = ConstraintNode.any(nodes: [orb, face])

    let json = try anyNode.toJson()
    #expect(!json.isEmpty)
}

@Test("ConstraintNode with ALL operator")
func constraintNodeAll() throws {
    let orb = ConstraintNode.item(request: RequestItem(.orb))
    let doc = ConstraintNode.item(request: RequestItem(.secureDocument))

    let allNode = ConstraintNode.all(nodes: [orb, doc])

    let json = try allNode.toJson()
    #expect(!json.isEmpty)
}

@Test("anyOf convenience function")
func anyOfConvenience() throws {
    let constraint = anyOf(RequestItem(.orb), RequestItem(.face))

    let json = try constraint.toJson()
    #expect(!json.isEmpty)
}

@Test("allOf convenience function")
func allOfConvenience() throws {
    let constraint = allOf(RequestItem(.orb), RequestItem(.document))

    let json = try constraint.toJson()
    #expect(!json.isEmpty)
}

// MARK: - Session Creation Tests
// Note: These tests verify API shape, actual sessions need valid credentials

@Test("verify() builder API shape")
func verifyBuilderAPIShape() {
    // Create a test RpContext (in production this would come from your backend)
    // Note: RpId must be "rp_" followed by exactly 16 hex characters
    let rpContext = try! RpContext(
        rpId: "rp_1234567890abcdef",
        nonce: "test-nonce",
        createdAt: UInt64(Date().timeIntervalSince1970),
        expiresAt: UInt64(Date().timeIntervalSince1970) + 3600,
        signature: "test-signature"
    )

    let config = VerifyConfig(
        appId: "app_test_invalid",
        action: "test",
        rpContext: rpContext,
        actionDescription: nil,
        bridgeUrl: nil
    )

    // This will throw without valid credentials - verify API exists
    let builder = verify(config: config)
    _ = try? builder.constraints(constraints: anyOf(RequestItem(.orb)))

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

@Test("verify().preset() API shape")
func verifyPresetAPIShape() {
    let rpContext = try! RpContext(
        rpId: "rp_1234567890abcdef",
        nonce: "test-nonce",
        createdAt: UInt64(Date().timeIntervalSince1970),
        expiresAt: UInt64(Date().timeIntervalSince1970) + 3600,
        signature: "test-signature"
    )

    let config = VerifyConfig(
        appId: "app_test_invalid",
        action: "test",
        rpContext: rpContext,
        actionDescription: nil,
        bridgeUrl: nil
    )

    // This will throw without valid credentials - verify API exists
    let builder = verify(config: config)
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

    @Test("RequestItem convenience function with string signal")
    func requestItemConvenienceWithString() {
        let item = RequestItem(.orb, signal: "test_signal")

        #expect(item.credentialType == .orb)
        #expect(item.signal != nil)
    }

    @Test("RequestItem convenience function without signal")
    func requestItemConvenienceWithoutSignal() {
        let item = RequestItem(.face)

        #expect(item.credentialType == .face)
        #expect(item.signal == nil)
    }

    @Test("Signal convenience properties")
    func signalConvenienceProperties() {
        let signal = Signal.fromString(s: "test_signal")

        // Test Swift extension properties
        #expect(signal.stringValue == "test_signal")
        #expect(signal.bytesData == Data("test_signal".utf8))
    }
}
