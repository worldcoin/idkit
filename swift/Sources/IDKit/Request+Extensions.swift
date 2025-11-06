import Foundation

extension Request {
    /// Convenience initializer for creating a request with a signal
    ///
    /// - Parameters:
    ///   - credentialType: The type of credential to request
    ///   - signal: Optional string signal
    ///   - faceAuth: Optional face authentication requirement (only valid for Orb and Face credentials)
    ///
    /// ## Example
    /// ```swift
    /// let request = Request(credentialType: .orb, signal: "user_12345", faceAuth: true)
    /// ```
    public convenience init(
        credentialType: CredentialType,
        signal: String? = nil,
        faceAuth: Bool? = nil
    ) throws {
        let signalObj = signal.map { Signal.fromString(s: $0) }
        self.init(credentialType: credentialType, signal: signalObj)

        if let faceAuth = faceAuth {
            return try Request(credentialType: credentialType, signal: signalObj)
                .withFaceAuth(faceAuth: faceAuth)
        }
    }

    /// Convenience initializer for creating a request with ABI-encoded signal
    ///
    /// - Parameters:
    ///   - credentialType: The type of credential to request
    ///   - abiEncodedSignal: ABI-encoded signal bytes (for on-chain verification)
    ///   - faceAuth: Optional face authentication requirement
    ///
    /// ## Example
    /// ```swift
    /// let signalBytes = Data([0x00, 0x01, 0x02...])
    /// let request = Request(credentialType: .orb, abiEncodedSignal: signalBytes)
    /// ```
    public convenience init(
        credentialType: CredentialType,
        abiEncodedSignal: Data,
        faceAuth: Bool? = nil
    ) throws {
        let signalObj = Signal.fromAbiEncoded(bytes: Array(abiEncodedSignal))
        self.init(credentialType: credentialType, signal: signalObj)

        if let faceAuth = faceAuth {
            return try Request(credentialType: credentialType, signal: signalObj)
                .withFaceAuth(faceAuth: faceAuth)
        }
    }
}

extension Signal {
    /// Gets the signal as Data
    public var data: Data {
        Data(self.asBytes())
    }

    /// Gets the signal as a string if it's a UTF-8 string signal
    public var string: String? {
        self.asString()
    }
}
