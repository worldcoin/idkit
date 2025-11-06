import Foundation

extension VerificationLevel: CustomStringConvertible {
    public var description: String {
        switch self {
        case .orb: return "orb"
        case .device: return "device"
        case .secureDocument: return "secure_document"
        case .document: return "document"
        }
    }
}

extension VerificationLevel: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let string = try container.decode(String.self)

        switch string.lowercased() {
        case "orb":
            self = .orb
        case "device":
            self = .device
        case "secure_document", "securedocument":
            self = .secureDocument
        case "document":
            self = .document
        default:
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unknown verification level: \(string)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(self.description)
    }
}

extension Session {
    /// Creates a session from a verification level
    ///
    /// Maps a verification level to appropriate credential types and constraints.
    ///
    /// - Parameters:
    ///   - appId: Application ID from the Developer Portal
    ///   - action: Action identifier
    ///   - verificationLevel: The verification level to use
    ///   - signal: Signal for the proof
    ///   - actionDescription: Optional description shown to users
    ///   - bridgeUrl: Optional bridge URL
    ///
    /// ## Example
    /// ```swift
    /// let session = try Session.create(
    ///     appId: "app_staging_123",
    ///     action: "vote",
    ///     verificationLevel: .orb,
    ///     signal: "proposal_456"
    /// )
    /// ```
    public static func create(
        appId: String,
        action: String,
        verificationLevel: VerificationLevel,
        signal: String,
        actionDescription: String? = nil,
        bridgeUrl: String? = nil
    ) throws -> Session {
        // Use the Rust implementation which already handles the mapping
        return try Session.fromVerificationLevel(
            appId: appId,
            action: action,
            verificationLevel: verificationLevel,
            signal: signal
        )
    }
}
