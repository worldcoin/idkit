import Foundation
import Testing
@testable import IDKit

private struct NullifierVectors: Decodable {
    struct Vector: Decodable {
        let input: String
        let hex: String
        let decimal: String
        let canonical: String
    }
    let valid: [Vector]
    let invalid: [String]
    let invalid_canonical: [String]
}

@Test("Nullifier uses the shared numeric parsing examples")
func nullifierVectors() throws {
    let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
    let data = try Data(contentsOf: root.appendingPathComponent("test-vectors/nullifier.json"))
    let vectors = try JSONDecoder().decode(NullifierVectors.self, from: data)
    for vector in vectors.valid {
        let value = try Nullifier.fromHex(hex: vector.input)
        #expect(value.toHex() == vector.hex)
        #expect(value.toCanonicalString() == vector.canonical)
        let restored = try Nullifier.fromCanonicalString(canonicalString: value.toCanonicalString())
        #expect(restored.toHex() == vector.hex)
        #expect(restored.toDecimalString() == vector.decimal)
        #expect(value.toDecimalString() == vector.decimal)
        #expect(try Nullifier.fromHex(hex: value.toHex()).toDecimalString() == vector.decimal)
    }
    for input in vectors.invalid_canonical {
        #expect(throws: (any Error).self) { try Nullifier.fromCanonicalString(canonicalString: input) }
    }
    for input in vectors.invalid {
        #expect(throws: (any Error).self) { try Nullifier.fromHex(hex: input) }
    }
}
