import Foundation

/// Main entry point for IDKit Swift SDK
public enum IDKit {
    /// Version of the IDKit SDK
    public static let version = "4.0.1"
}

// MARK: - Convenience wrappers around UniFFI-generated types

/// Creates a RequestItem for a credential type
///
/// - Parameters:
///   - type: The credential type (e.g., .orb, .face)
///   - signal: Optional signal string for cryptographic binding
/// - Returns: A RequestItem instance
///
/// Example:
/// ```swift
/// let orb = RequestItem(.orb, signal: "user-123")
/// let face = RequestItem(.face)
/// ```
public func RequestItem(_ type: CredentialType, signal: String? = nil) -> idkit_core.RequestItem {
    idkit_core.RequestItem.new(credentialType: type, signal: signal.map { Signal.fromString(s: $0) })
}

/// Creates an OR constraint - at least one child must be satisfied
///
/// - Parameter items: The request items (at least one must be satisfied)
/// - Returns: A ConstraintNode representing an "any" constraint
///
/// Example:
/// ```swift
/// let constraint = anyOf(RequestItem(.orb), RequestItem(.face))
/// ```
public func anyOf(_ items: idkit_core.RequestItem...) -> ConstraintNode {
    ConstraintNode.any(nodes: items.map { ConstraintNode.item(request: $0) })
}

/// Creates an OR constraint from an array of request items
///
/// - Parameter items: Array of request items (at least one must be satisfied)
/// - Returns: A ConstraintNode representing an "any" constraint
public func anyOf(_ items: [idkit_core.RequestItem]) -> ConstraintNode {
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
/// let constraint = allOf(RequestItem(.orb), RequestItem(.document))
/// ```
public func allOf(_ items: idkit_core.RequestItem...) -> ConstraintNode {
    ConstraintNode.all(nodes: items.map { ConstraintNode.item(request: $0) })
}

/// Creates an AND constraint from an array of request items
///
/// - Parameter items: Array of request items (all must be satisfied)
/// - Returns: A ConstraintNode representing an "all" constraint
public func allOf(_ items: [idkit_core.RequestItem]) -> ConstraintNode {
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
/// let session = try verify(config: config).preset(preset: orbLegacy(signal: "user-123"))
/// ```
public func orbLegacy(signal: String? = nil) -> Preset {
    .orbLegacy(OrbLegacyPreset(signal: signal))
}

// MARK: - Usage example - Explicit constraints
//
// let orb = RequestItem(.orb, signal: "user-123")
// let face = RequestItem(.face)
//
// let config = VerifyConfig(
//     appId: "app_staging_xxxxx",
//     action: "my-action",
//     rpContext: rpContext,
//     actionDescription: nil,
//     bridgeUrl: nil
// )
//
// let session = try verify(config: config).constraints(constraints: anyOf(orb, face))
// let connectUrl = session.connectUrl()
// let status = session.pollStatus(pollIntervalMs: 2000, timeoutMs: 300000)
//
// MARK: - Usage example - Preset (World ID 3.0 legacy support)
//
// let session = try verify(config: config).preset(preset: orbLegacy(signal: "user-123"))
