import Foundation

/// Credential category
///
/// This is syntactic sugar over the constraint system. Each category maps to specific
/// credential types and constraints.
///
/// ## Example
/// ```swift
/// // Simple category-based session
/// let session = try Session.create(
///     appId: "app_123",
///     action: "verify",
///     credentialCategories: [.personhood, .document]
/// )
/// ```
public enum CredentialCategory: String, Codable, Sendable {
    /// NFC document without authentication
    case document

    /// NFC document with authentication (eID, passport with Active or Chipp Authentication, MNC, etc.)
    case secureDocument = "secure_document"

    /// Iris code verification (World ID Orb)
    case personhood

    /// Converts the category to a credential type
    internal var credentialType: CredentialType {
        switch self {
        case .document:
            return .document
        case .secureDocument:
            return .secureDocument
        case .personhood:
            return .orb
        }
    }

    /// Converts a single category to constraints
    public func toConstraints() throws -> Constraints {
        try Constraints.any(credentials: [self.credentialType])
    }

    /// Converts multiple categories to constraints with "any" logic
    ///
    /// Creates a constraint where at least one of the categories must be satisfied.
    /// Priority is determined by the order in the set.
    public static func toConstraints(_ categories: Set<CredentialCategory>) throws -> Constraints {
        guard !categories.isEmpty else {
            throw CredentialCategoryError.emptyCategories
        }

        let credentialTypes = categories.map { $0.credentialType }
        return try Constraints.any(credentials: Array(credentialTypes))
    }

    /// Converts multiple categories to requests
    ///
    /// Creates one request per category with the given signal.
    public static func toRequests(
        _ categories: Set<CredentialCategory>,
        signal: String?
    ) throws -> [Request] {
        guard !categories.isEmpty else {
            throw CredentialCategoryError.emptyCategories
        }

        let signalObj = signal.map { Signal.fromString(s: $0) }

        return try categories.map { category in
            try Request(credentialType: category.credentialType, signal: signalObj)
        }
    }
}

/// Response type for credential category-based sessions
///
/// Contains both the proofs returned and the original query.
public struct CredentialCategoryProofResponse: Codable, Sendable {
    /// The proofs returned by World App
    public let response: [Proof]

    /// The credential categories that were requested
    public let query: [CredentialCategory]

    public init(response: [Proof], query: [CredentialCategory]) {
        self.response = response
        self.query = query
    }
}

/// Errors related to credential categories
public enum CredentialCategoryError: Error, LocalizedError {
    case emptyCategories

    public var errorDescription: String? {
        switch self {
        case .emptyCategories:
            return "At least one credential category must be provided"
        }
    }
}

// MARK: - Session Extensions for Credential Categories

extension Session {
    /// Creates a session using credential categories (syntactic sugar)
    ///
    /// This is a convenience method that converts credential categories to the underlying
    /// constraint system.
    ///
    /// - Parameters:
    ///   - appId: Application ID from the Developer Portal
    ///   - action: Action identifier
    ///   - credentialCategories: Set of credential categories to request
    ///   - signal: Optional signal for all requests
    ///   - actionDescription: Optional description shown to users
    ///   - bridgeUrl: Optional bridge URL (defaults to production)
    ///
    /// - Returns: A configured session ready for verification
    ///
    /// ## Example
    /// ```swift
    /// let session = try Session.create(
    ///     appId: "app_staging_123",
    ///     action: "verify-age",
    ///     credentialCategories: [.personhood, .secureDocument],
    ///     signal: "user_12345"
    /// )
    /// ```
    public static func create(
        appId: String,
        action: String,
        credentialCategories: Set<CredentialCategory>,
        signal: String? = nil,
        actionDescription: String? = nil,
        bridgeUrl: String? = nil
    ) throws -> Session {
        let requests = try CredentialCategory.toRequests(credentialCategories, signal: signal)
        let constraints = try CredentialCategory.toConstraints(credentialCategories)

        return try Session.createWithOptions(
            appId: appId,
            action: action,
            requests: requests,
            actionDescription: actionDescription,
            constraints: constraints,
            bridgeUrl: bridgeUrl
        )
    }
}
