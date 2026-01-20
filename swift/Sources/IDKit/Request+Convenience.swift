import Foundation

public extension Request {
    /// Convenience initializer that accepts a string signal.
    ///
    /// Use this when you have a plain string signal value.
    /// The parameter is named `stringSignal` to avoid ambiguity with the
    /// generated uniffi init that accepts `Signal?`.
    convenience init(
        credentialType: CredentialType,
        stringSignal: String?
    ) throws {
        let signalObject = stringSignal.map { Signal.fromString(s: $0) }
        let base = Request(credentialType: credentialType, signal: signalObject)
        self.init(unsafeFromHandle: base.uniffiCloneHandle())
    }

    /// Convenience initializer that accepts raw ABI-encoded bytes.
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
