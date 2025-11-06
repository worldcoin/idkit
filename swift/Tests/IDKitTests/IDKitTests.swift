import XCTest
@testable import IDKit

final class IDKitTests: XCTestCase {

    // MARK: - Request Tests

    func testRequestCreationWithStringSignal() throws {
        let request = try Request(
            credentialType: .orb,
            signal: "test_signal"
        )

        XCTAssertEqual(request.credentialType(), .orb)
        XCTAssertNotNil(request.getSignalBytes())
    }

    func testRequestCreationWithoutSignal() throws {
        let request = Request(credentialType: .device, signal: nil)

        XCTAssertEqual(request.credentialType(), .device)
        XCTAssertNil(request.getSignalBytes())
    }

    func testRequestWithFaceAuth() throws {
        let request = try Request(credentialType: .orb, signal: "test")
        let withAuth = request.withFaceAuth(faceAuth: true)

        XCTAssertEqual(withAuth.faceAuth(), true)
    }

    func testRequestCreationWithAbiEncodedSignal() throws {
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

    // MARK: - CredentialType Tests

    func testCredentialTypeDescription() {
        XCTAssertEqual(CredentialType.orb.description, "orb")
        XCTAssertEqual(CredentialType.face.description, "face")
        XCTAssertEqual(CredentialType.device.description, "device")
        XCTAssertEqual(CredentialType.secureDocument.description, "secure_document")
        XCTAssertEqual(CredentialType.document.description, "document")
    }

    func testCredentialTypeCodable() throws {
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        for credType in [CredentialType.orb, .face, .device, .secureDocument, .document] {
            let encoded = try encoder.encode(credType)
            let decoded = try decoder.decode(CredentialType.self, from: encoded)
            XCTAssertEqual(decoded, credType)
        }
    }

    // MARK: - VerificationLevel Tests

    func testVerificationLevelDescription() {
        XCTAssertEqual(VerificationLevel.orb.description, "orb")
        XCTAssertEqual(VerificationLevel.device.description, "device")
        XCTAssertEqual(VerificationLevel.secureDocument.description, "secure_document")
        XCTAssertEqual(VerificationLevel.document.description, "document")
    }

    func testVerificationLevelCodable() throws {
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        for level in [VerificationLevel.orb, .device, .secureDocument, .document] {
            let encoded = try encoder.encode(level)
            let decoded = try decoder.decode(VerificationLevel.self, from: encoded)
            XCTAssertEqual(decoded, level)
        }
    }

    // MARK: - Constraints Tests

    func testConstraintsAny() throws {
        let constraints = try Constraints.any(.orb, .face)

        // Verify it can be serialized
        let json = try constraints.toJson()
        XCTAssertFalse(json.isEmpty)
    }

    func testConstraintsAll() throws {
        let constraints = try Constraints.all(.orb, .secureDocument)

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

        let anyNode = try ConstraintNode.any(orb, face)

        let json = try anyNode.toJson()
        XCTAssertFalse(json.isEmpty)
    }

    func testConstraintNodeAll() throws {
        let orb = ConstraintNode.credential(credentialType: .orb)
        let doc = ConstraintNode.credential(credentialType: .secureDocument)

        let allNode = try ConstraintNode.all(orb, doc)

        let json = try allNode.toJson()
        XCTAssertFalse(json.isEmpty)
    }

    // MARK: - CredentialCategory Tests

    func testCredentialCategoryMapping() {
        XCTAssertEqual(CredentialCategory.personhood.credentialType, .orb)
        XCTAssertEqual(CredentialCategory.secureDocument.credentialType, .secureDocument)
        XCTAssertEqual(CredentialCategory.document.credentialType, .document)
    }

    func testCredentialCategoryToConstraints() throws {
        let constraints = try CredentialCategory.personhood.toConstraints()

        let json = try constraints.toJson()
        XCTAssertFalse(json.isEmpty)
    }

    func testCredentialCategoriesToConstraints() throws {
        let categories: Set<CredentialCategory> = [.personhood, .secureDocument]
        let constraints = try CredentialCategory.toConstraints(categories)

        let json = try constraints.toJson()
        XCTAssertFalse(json.isEmpty)
    }

    func testCredentialCategoriesToRequests() throws {
        let categories: Set<CredentialCategory> = [.personhood, .document]
        let requests = try CredentialCategory.toRequests(categories, signal: "test_signal")

        XCTAssertEqual(requests.count, 2)
        for request in requests {
            XCTAssertNotNil(request.getSignalBytes())
        }
    }

    func testEmptyCredentialCategoriesThrows() {
        let emptySet: Set<CredentialCategory> = []

        XCTAssertThrowsError(try CredentialCategory.toConstraints(emptySet)) { error in
            XCTAssertTrue(error is CredentialCategoryError)
        }

        XCTAssertThrowsError(try CredentialCategory.toRequests(emptySet, signal: "test")) { error in
            XCTAssertTrue(error is CredentialCategoryError)
        }
    }

    // MARK: - Session Creation Tests
    // Note: These tests will fail without a valid bridge connection
    // They're included to demonstrate the API shape

    func testSessionCreationAPIShape() {
        // This test just verifies the API compiles
        // It won't actually create a session without valid credentials

        let testCreation = {
            let request = try Request(credentialType: .orb, signal: "test")

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

            _ = try? Session.create(
                appId: "app_test_invalid",
                action: "test",
                credentialCategories: [.personhood],
                signal: "test"
            )

            _ = try? Session.create(
                appId: "app_test_invalid",
                action: "test",
                verificationLevel: .orb,
                signal: "test"
            )
        }

        XCTAssertNoThrow(testCreation())
    }

    // MARK: - SDK Version Test

    func testSDKVersion() {
        XCTAssertFalse(IDKit.version.isEmpty)
        XCTAssertTrue(IDKit.version.hasPrefix("3."))
    }
}
