import Foundation
import Testing
@testable import IDKit

// MARK: - Request Tests

@Test("Request creation with signal")
func requestCreationWithSignal() throws {
    let signal = Signal.fromString(s: "test_signal")
    let request = Request(credentialType: .orb, signal: signal)

    #expect(request.credentialType() == .orb)
    #expect(request.getSignalBytes() != nil)
}

@Test("Request creation without signal")
func requestCreationWithoutSignal() {
    let request = Request(credentialType: .device, signal: nil)

    #expect(request.credentialType() == .device)
    #expect(request.getSignalBytes() == nil)
}

@Test("Request with face authentication")
func requestWithFaceAuth() {
    let signal = Signal.fromString(s: "test")
    let request = Request(credentialType: .orb, signal: signal)
    let withAuth = request.withFaceAuth(faceAuth: true)

    #expect(withAuth.faceAuth() == true)
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

// MARK: - Constraints Tests

@Test("Constraints with ANY logic")
func constraintsAny() throws {
    let constraints = Constraints.any(credentials: [.orb, .face])

    // Verify it can be serialized
    let json = try constraints.toJson()
    #expect(!json.isEmpty)
}

@Test("Constraints with ALL logic")
func constraintsAll() throws {
    let constraints = Constraints.all(credentials: [.orb, .secureDocument])

    let json = try constraints.toJson()
    #expect(!json.isEmpty)
}

@Test("ConstraintNode credential leaf")
func constraintNodeCredential() throws {
    let node = ConstraintNode.credential(credentialType: .orb)

    let json = try node.toJson()
    #expect(!json.isEmpty)
}

@Test("ConstraintNode with ANY operator")
func constraintNodeAny() throws {
    let orb = ConstraintNode.credential(credentialType: .orb)
    let face = ConstraintNode.credential(credentialType: .face)

    let anyNode = ConstraintNode.any(nodes: [orb, face])

    let json = try anyNode.toJson()
    #expect(!json.isEmpty)
}

@Test("ConstraintNode with ALL operator")
func constraintNodeAll() throws {
    let orb = ConstraintNode.credential(credentialType: .orb)
    let doc = ConstraintNode.credential(credentialType: .secureDocument)

    let allNode = ConstraintNode.all(nodes: [orb, doc])

    let json = try allNode.toJson()
    #expect(!json.isEmpty)
}

// MARK: - Session Creation Tests
// Note: These tests verify API shape, actual sessions need valid credentials

@Test("Session creation API shape")
func sessionCreationAPIShape() {
    let signal = Signal.fromString(s: "test")
    let request = Request(credentialType: .orb, signal: signal)

    // Create a test RpContext (in production this would come from your backend)
    let rpContext = try! RpContext(
        rpId: "rp_test123456789abc",
        nonce: "test-nonce",
        createdAt: UInt64(Date().timeIntervalSince1970),
        expiresAt: UInt64(Date().timeIntervalSince1970) + 3600,
        signature: "test-signature"
    )

    // This will throw without valid app_id - verify API exists
    _ = try? Session.create(
        appId: "app_test_invalid",
        action: "test",
        requests: [request],
        rpContext: rpContext,
        actionDescription: nil,
        constraints: nil,
        bridgeUrl: nil
    )

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

    @Test("Request convenience init with string signal")
    func requestConvenienceInitWithString() throws {
        let request = try Request(
            credentialType: .orb,
            stringSignal: "test_signal"
        )

        #expect(request.credentialType() == .orb)
        #expect(request.getSignalBytes() != nil)
    }

    @Test("Request convenience init with ABI-encoded data")
    func requestConvenienceInitWithData() throws {
        let bytes = Data([0x00, 0x01, 0x02, 0x03])
        let request = try Request(
            credentialType: .orb,
            abiEncodedSignal: bytes
        )

        #expect(request.credentialType() == .orb)
        #expect(request.getSignalBytes() != nil)
    }

    @Test("Signal convenience properties")
    func signalConvenienceProperties() {
        let signal = Signal.fromString(s: "test_signal")

        // Test Swift extension properties
        #expect(signal.stringValue == "test_signal")
        #expect(signal.bytesData == Data("test_signal".utf8))
    }
}
