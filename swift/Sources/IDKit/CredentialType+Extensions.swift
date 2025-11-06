import Foundation

extension CredentialType: CustomStringConvertible {
    public var description: String {
        switch self {
        case .orb: return "orb"
        case .face: return "face"
        case .device: return "device"
        case .secureDocument: return "secure_document"
        case .document: return "document"
        }
    }
}

extension CredentialType: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let string = try container.decode(String.self)

        switch string.lowercased() {
        case "orb":
            self = .orb
        case "face":
            self = .face
        case "device":
            self = .device
        case "secure_document", "securedocument":
            self = .secureDocument
        case "document":
            self = .document
        default:
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unknown credential type: \(string)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(self.description)
    }
}
