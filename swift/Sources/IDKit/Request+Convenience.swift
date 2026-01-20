import Foundation

public extension Request {
    /// Mirrors IDKit v2 Swift initializer that accepted a string signal.
    convenience init(
        credentialType: CredentialType,
        signal: String?
    ) throws {
        let signalObject = signal.map { Signal.fromString(s: $0) }
        let base = Request(credentialType: credentialType, signal: signalObject)
        self.init(unsafeFromHandle: base.uniffiCloneHandle())
    }

    /// Mirrors the IDKit v2 Swift initializer that accepted raw ABI-encoded bytes.
    convenience init(
        credentialType: CredentialType,
        abiEncodedSignal: Data
    ) throws {
        let signalObject = Signal.fromAbiEncoded(bytes: abiEncodedSignal)
        let base = Request(credentialType: credentialType, signal: signalObject)
        self.init(unsafeFromHandle: base.uniffiCloneHandle())
    }
}

public extension Signal {
    /// Backwards-compatible computed property returning the raw bytes as Data.
    var bytesData: Data { self.asBytes() }

    /// Backwards-compatible computed property exposing the string form when available.
    var stringValue: String? { self.asString() }
}

public extension SessionWrapper {
    /// Convenience initializer to create a session with RP context.
    ///
    /// In production, the rpContext should be generated and signed by your backend.
    ///
    /// - Parameters:
    ///   - appId: Application ID from the Developer Portal
    ///   - action: Action identifier
    ///   - requests: List of credential requests
    ///   - rpContext: RP context for protocol-level proof requests
    ///   - actionDescription: Optional action description shown to users
    ///   - constraints: Optional constraints on which credentials are acceptable
    ///   - bridgeUrl: Optional custom bridge URL
    convenience init(
        appId: String,
        action: String,
        requests: [Request],
        rpContext: RpContext,
        actionDescription: String? = nil,
        constraints: Constraints? = nil,
        bridgeUrl: String? = nil
    ) throws {
        let session = try SessionWrapper.create(
            appId: appId,
            action: action,
            requests: requests,
            rpContext: rpContext,
            actionDescription: actionDescription,
            constraints: constraints,
            bridgeUrl: bridgeUrl
        )
        self.init(unsafeFromHandle: session.uniffiCloneHandle())
    }
}
