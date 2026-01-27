import Foundation

/// Main entry point for IDKit Swift SDK
public enum IDKit {
    /// Version of the IDKit SDK
    public static let version = "4.0.1"

    /// Creates a new IDKit request builder
    ///
    /// This is the main entry point for creating World ID verification requests.
    /// Use the builder pattern with constraints to specify which credentials to accept.
    ///
    /// - Parameter config: Request configuration
    /// - Returns: An IDKitRequestBuilder instance
    ///
    /// Example:
    /// ```swift
    /// let request = try IDKit.request(config: config)
    ///     .constraints(anyOf(CredentialRequest.create(.orb), CredentialRequest.create(.face)))
    /// ```
    public static func request(config: IDKitRequestConfig) -> IDKitRequestBuilder {
        IDKitRequestBuilder.new(config: config)
    }
}

// MARK: - RequestItem convenience extension
//
// UniFFI generates static methods from Rust constructors:
//   - RequestItem.new(credentialType:signal:) - takes Signal?
//   - RequestItem.withStringSignal(credentialType:signal:) - takes String?
//
// The static `create` method below provides a cleaner positional API:
//   RequestItem.create(.orb, signal: "test")

public extension RequestItem {
    /// Creates a RequestItem for a credential type with an optional string signal
    ///
    /// This is a convenience factory method with a cleaner positional API.
    ///
    /// - Parameters:
    ///   - type: The credential type (e.g., .orb, .face)
    ///   - signal: Optional signal string for cryptographic binding
    /// - Returns: A RequestItem instance
    ///
    /// Example:
    /// ```swift
    /// let orb = RequestItem.create(.orb, signal: "user-123")
    /// let face = RequestItem.create(.face)
    /// ```
    static func create(_ type: CredentialType, signal: String? = nil) -> RequestItem {
        RequestItem.withStringSignal(credentialType: type, signal: signal)
    }
}

// MARK: - Convenience wrappers around UniFFI-generated types

/// Creates an OR constraint - at least one child must be satisfied
///
/// - Parameter items: The request items (at least one must be satisfied)
/// - Returns: A ConstraintNode representing an "any" constraint
///
/// Example:
/// ```swift
/// let constraint = anyOf(RequestItem.create(.orb), RequestItem.create(.face))
/// ```
public func anyOf(_ items: RequestItem...) -> ConstraintNode {
    ConstraintNode.any(nodes: items.map { ConstraintNode.item(request: $0) })
}

/// Creates an OR constraint from an array of request items
///
/// - Parameter items: Array of request items (at least one must be satisfied)
/// - Returns: A ConstraintNode representing an "any" constraint
public func anyOf(_ items: [RequestItem]) -> ConstraintNode {
    ConstraintNode.any(nodes: items.map { ConstraintNode.item(request: $0) })
}

/// Creates an OR constraint from constraint nodes
///
/// - Parameter nodes: The constraint nodes (at least one must be satisfied)
/// - Returns: A ConstraintNode representing an "any" constraint
///
/// Example:
/// ```swift
/// let constraint = anyOf(nodes: ConstraintNode.item(request: orb), ConstraintNode.item(request: face))
/// ```
public func anyOf(nodes: ConstraintNode...) -> ConstraintNode {
    ConstraintNode.any(nodes: nodes)
}

/// Creates an OR constraint from an array of constraint nodes
///
/// - Parameter nodes: Array of constraint nodes (at least one must be satisfied)
/// - Returns: A ConstraintNode representing an "any" constraint
public func anyOf(nodes: [ConstraintNode]) -> ConstraintNode {
    ConstraintNode.any(nodes: nodes)
}

/// Creates an AND constraint - all children must be satisfied
///
/// - Parameter items: The request items (all must be satisfied)
/// - Returns: A ConstraintNode representing an "all" constraint
///
/// Example:
/// ```swift
/// let constraint = allOf(RequestItem.create(.orb), RequestItem.create(.document))
/// ```
public func allOf(_ items: RequestItem...) -> ConstraintNode {
    ConstraintNode.all(nodes: items.map { ConstraintNode.item(request: $0) })
}

/// Creates an AND constraint from an array of request items
///
/// - Parameter items: Array of request items (all must be satisfied)
/// - Returns: A ConstraintNode representing an "all" constraint
public func allOf(_ items: [RequestItem]) -> ConstraintNode {
    ConstraintNode.all(nodes: items.map { ConstraintNode.item(request: $0) })
}

/// Creates an AND constraint from constraint nodes
///
/// - Parameter nodes: The constraint nodes (all must be satisfied)
/// - Returns: A ConstraintNode representing an "all" constraint
///
/// Example:
/// ```swift
/// let constraint = allOf(nodes: orbNode, anyOf(document, secureDocument))
/// ```
public func allOf(nodes: ConstraintNode...) -> ConstraintNode {
    ConstraintNode.all(nodes: nodes)
}

/// Creates an AND constraint from an array of constraint nodes
///
/// - Parameter nodes: Array of constraint nodes (all must be satisfied)
/// - Returns: A ConstraintNode representing an "all" constraint
public func allOf(nodes: [ConstraintNode]) -> ConstraintNode {
    ConstraintNode.all(nodes: nodes)
}

// MARK: - Preset helpers

/// Creates an OrbLegacy preset for World ID 3.0 legacy support
///
/// This preset creates a session compatible with both World ID 4.0 and 3.0 protocols.
/// Use this when you need backward compatibility with older World App versions.
///
/// - Parameter signal: Optional signal string for cryptographic binding
/// - Returns: An OrbLegacy preset
///
/// Example:
/// ```swift
/// let request = try IDKit.request(config: config).preset(preset: orbLegacy(signal: "user-123"))
/// ```
public func orbLegacy(signal: String? = nil) -> Preset {
    .orbLegacy(OrbLegacyPreset(signal: signal))
}

// MARK: - Signal convenience extensions

public extension Signal {
    /// Returns the signal bytes as Foundation Data
    var bytesData: Data {
        Data(self.asBytes())
    }

    /// Returns the signal as a string if it's valid UTF-8, nil otherwise
    var stringValue: String? {
        self.asString()
    }
}

