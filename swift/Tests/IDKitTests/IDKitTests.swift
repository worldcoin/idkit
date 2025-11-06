import XCTest
@testable import IDKit

final class IDKitTests: XCTestCase {

    // MARK: - Request Tests

    func testRequestCreationWithSignal() throws {
        let signal = Signal.fromString(s: "test_signal")
        let request = Request.new(
            credentialType: .orb,
            signal: signal
        )

        XCTAssertEqual(request.credentialType(), .orb)
        XCTAssertNotNil(request.getSignalBytes())
    }

    func testRequestCreationWithoutSignal() {
        let request = Request.new(credentialType: .device, signal: nil)

        XCTAssertEqual(request.credentialType(), .device)
        XCTAssertNil(request.getSignalBytes())
    }

    func testRequestWithFaceAuth() {
        let signal = Signal.fromString(s: "test")
        let request = Request.new(credentialType: .orb, signal: signal)
        let withAuth = request.withFaceAuth(faceAuth: true)

        XCTAssertEqual(withAuth.faceAuth(), true)
    }

    func testRequestConvenienceInitWithString() throws {
        // Test the Swift convenience initializer
        let request = try Request(
            credentialType: .orb,
            signal: "test_signal"
        )

        XCTAssertEqual(request.credentialType(), .orb)
        XCTAssertNotNil(request.getSignalBytes())
    }

    func testRequestConvenienceInitWithData() throws {
        let bytes = Data([0x00, 0x01, 0x02, 0x03])
        let request = try Request(
            credentialType: .orb,
            abiEncodedSignal: bytes
        )

        XCTAssertEqual(request.credentialType(), .orb)
        XCTAssertNotNil(request.getSignalBytes())
    }

    // MARK: - Signal Tests

    func testSignalFromString() {
        let signal = Signal.fromString(s: "test_signal")

        XCTAssertEqual(signal.string, "test_signal")
        XCTAssertEqual(String(data: signal.data, encoding: .utf8), "test_signal")
    }

    func testSignalFromAbiEncoded() {
        let bytes: [UInt8] = [0x00, 0x01, 0x02, 0x03]
        let signal = Signal.fromAbiEncoded(bytes: bytes)

        XCTAssertEqual(signal.data, Data(bytes))
        XCTAssertNil(signal.string)  // Not a valid UTF-8 string
    }

    func testSignalDataProperty() {
        let signal = Signal.fromString(s: "test")
        let data = signal.data

        XCTAssertEqual(String(data: data, encoding: .utf8), "test")
    }

    func testSignalStringProperty() {
        let signal = Signal.fromString(s: "hello")

        XCTAssertEqual(signal.string, "hello")
    }

    // MARK: - CredentialType Tests

    func testCredentialTypeExists() {
        // Test that all credential types are available from Rust
        let types: [CredentialType] = [.orb, .face, .device, .secureDocument, .document]

        XCTAssertEqual(types.count, 5)
    }

    // MARK: - VerificationLevel Tests

    func testVerificationLevelExists() {
        // Test that all verification levels are available from Rust
        let levels: [VerificationLevel] = [.orb, .device, .secureDocument, .document]

        XCTAssertEqual(levels.count, 4)
    }

    // MARK: - Constraints Tests

    func testConstraintsAny() throws {
        let constraints = Constraints.any(credentials: [.orb, .face])

        // Verify it can be serialized
        let json = try constraints.toJson()
        XCTAssertFalse(json.isEmpty)
    }

    func testConstraintsAll() throws {
        let constraints = Constraints.all(credentials: [.orb, .secureDocument])

        let json = try constraints.toJson()
        XCTAssertFalse(json.isEmpty)
    }

    func testConstraintNodeCredential() {
        let node = ConstraintNode.credential(credentialType: .orb)

        let json = try? node.toJson()
        XCTAssertNotNil(json)
    }

    func testConstraintNodeAny() throws {
        let orb = ConstraintNode.credential(credentialType: .orb)
        let face = ConstraintNode.credential(credentialType: .face)

        let anyNode = ConstraintNode.any(nodes: [orb, face])

        let json = try anyNode.toJson()
        XCTAssertFalse(json.isEmpty)
    }

    func testConstraintNodeAll() throws {
        let orb = ConstraintNode.credential(credentialType: .orb)
        let doc = ConstraintNode.credential(credentialType: .secureDocument)

        let allNode = ConstraintNode.all(nodes: [orb, doc])

        let json = try allNode.toJson()
        XCTAssertFalse(json.isEmpty)
    }

    // MARK: - Session Creation Tests
    // Note: These tests verify API shape, actual sessions need valid credentials

    func testSessionCreationAPIShape() {
        let testCreation = {
            let signal = Signal.fromString(s: "test")
            let request = Request.new(credentialType: .orb, signal: signal)

            // These will throw without valid app_id
            _ = try? Session.create(
                appId: "app_test_invalid",
                action: "test",
                requests: [request]
            )

            _ = try? Session.createWithOptions(
                appId: "app_test_invalid",
                action: "test",
                requests: [request],
                actionDescription: "Test",
                constraints: nil,
                bridgeUrl: nil
            )

            _ = try? Session.fromVerificationLevel(
                appId: "app_test_invalid",
                action: "test",
                verificationLevel: .orb,
                signal: "test"
            )
        }

        XCTAssertNoThrow(testCreation())
    }

    // MARK: - Session Extensions Tests

    func testSessionVerificationURLProperty() {
        // Create a mock session (will fail but we just want to test the extension exists)
        // In real use, this would be called on a valid session
        let signal = Signal.fromString(s: "test")
        let request = Request.new(credentialType: .orb, signal: signal)

        if let session = try? Session.create(
            appId: "app_staging_test",
            action: "test",
            requests: [request]
        ) {
            // If session creation succeeds (unlikely without valid credentials),
            // verify the convenience properties work
            XCTAssertNotNil(session.verificationURL)
            XCTAssertNotNil(session.requestUUID)
        }
    }

    // MARK: - SDK Version Test

    func testSDKVersion() {
        XCTAssertFalse(IDKit.version.isEmpty)
        XCTAssertTrue(IDKit.version.hasPrefix("3."))
    }

    // MARK: - Proof Tests

    func testProofSerialization() throws {
        let proof = Proof(
            proof: "0x123",
            merkleRoot: "0x456",
            nullifierHash: "0x789",
            verificationLevel: .orb
        )

        let json = try proofToJson(proof: proof)
        let parsed = try proofFromJson(json: json)

        XCTAssertEqual(parsed.proof, "0x123")
        XCTAssertEqual(parsed.merkleRoot, "0x456")
        XCTAssertEqual(parsed.nullifierHash, "0x789")
        XCTAssertEqual(parsed.verificationLevel, .orb)
    }
}
