import Foundation

extension Constraints {
    /// Creates an "any" constraint using a variadic list of credential types
    ///
    /// At least one of the provided credentials must be satisfied.
    /// Order matters: earlier credentials have higher priority.
    ///
    /// ## Example
    /// ```swift
    /// let constraints = Constraints.any(.orb, .face, .device)
    /// ```
    public static func any(_ credentials: CredentialType...) throws -> Constraints {
        try Constraints.any(credentials: Array(credentials))
    }

    /// Creates an "all" constraint using a variadic list of credential types
    ///
    /// All of the provided credentials must be satisfied.
    ///
    /// ## Example
    /// ```swift
    /// let constraints = Constraints.all(.orb, .secureDocument)
    /// ```
    public static func all(_ credentials: CredentialType...) throws -> Constraints {
        try Constraints.all(credentials: Array(credentials))
    }
}

extension ConstraintNode {
    /// Creates an "any" (OR) constraint node from a variadic list
    ///
    /// ## Example
    /// ```swift
    /// let node = ConstraintNode.any(
    ///     ConstraintNode.credential(credentialType: .orb),
    ///     ConstraintNode.credential(credentialType: .face)
    /// )
    /// ```
    public static func any(_ nodes: ConstraintNode...) throws -> ConstraintNode {
        try ConstraintNode.any(nodes: Array(nodes))
    }

    /// Creates an "all" (AND) constraint node from a variadic list
    ///
    /// ## Example
    /// ```swift
    /// let node = ConstraintNode.all(
    ///     ConstraintNode.credential(credentialType: .orb),
    ///     ConstraintNode.credential(credentialType: .secureDocument)
    /// )
    /// ```
    public static func all(_ nodes: ConstraintNode...) throws -> ConstraintNode {
        try ConstraintNode.all(nodes: Array(nodes))
    }
}
