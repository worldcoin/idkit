import Foundation

// Re-export the generated types
@_exported import struct idkit.Proof
@_exported import enum idkit.CredentialType
@_exported import enum idkit.VerificationLevel
@_exported import enum idkit.Status
@_exported import enum idkit.IdkitError
@_exported import class idkit.Session
@_exported import class idkit.Request
@_exported import class idkit.Signal
@_exported import class idkit.Constraints
@_exported import class idkit.ConstraintNode

/// Main entry point for IDKit Swift SDK
public enum IDKit {
    /// Version of the IDKit SDK
    public static let version = "3.0.0"
}
