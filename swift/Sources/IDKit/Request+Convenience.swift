import Foundation

private struct RequestSnapshot: Decodable {
    let type: String
    let faceAuth: Bool?

    enum CodingKeys: String, CodingKey {
        case type
        case faceAuth = "face_auth"
    }
}

private func credentialType(from raw: String) -> CredentialType {
    switch raw {
    case "orb":
        return .orb
    case "face":
        return .face
    case "secure_document":
        return .secureDocument
    case "document":
        return .document
    case "device":
        return .device
    default:
        fatalError("Unsupported credential type: \(raw)")
    }
}

public extension Request {
    /// Backwards-compatible initializer matching earlier Swift API shape.
    convenience init(
        credentialType: CredentialType,
        signal: Signal?
    ) {
        let base = Request.create(credentialType: credentialType, signal: signal)
        self.init(unsafeFromHandle: base.uniffiCloneHandle())
    }

    /// Mirrors IDKit v2 Swift initializer that accepted a string signal.
    convenience init(
        credentialType: CredentialType,
        signal: String?,
        faceAuth: Bool? = nil
    ) throws {
        let signalObject = signal.map { Signal.fromString(s: $0) }
        let base = Request.create(credentialType: credentialType, signal: signalObject)
        let final = faceAuth.map { base.withFaceAuth(faceAuth: $0) } ?? base
        self.init(unsafeFromHandle: final.uniffiCloneHandle())
    }

    /// Mirrors the IDKit v2 Swift initializer that accepted raw ABI-encoded bytes.
    convenience init(
        credentialType: CredentialType,
        abiEncodedSignal: Data,
        faceAuth: Bool? = nil
    ) throws {
        let signalObject = Signal.fromAbiEncoded(bytes: abiEncodedSignal)
        let base = Request.create(credentialType: credentialType, signal: signalObject)
        let final = faceAuth.map { base.withFaceAuth(faceAuth: $0) } ?? base
        self.init(unsafeFromHandle: final.uniffiCloneHandle())
    }

    /// Backwards-compatible alias for the UniFFI setter.
    func withFaceAuth(faceAuth: Bool) -> Request {
        setFaceAuth(faceAuth: faceAuth)
    }

    /// Backwards-compatible accessor for credential type.
    func credentialType() -> CredentialType {
        let json = (try? toJson()) ?? "{}"
        let payload = (try? JSONDecoder().decode(RequestSnapshot.self, from: Data(json.utf8)))
        guard let raw = payload?.type else {
            fatalError("Missing credential type in request JSON")
        }
        return credentialType(from: raw)
    }

    /// Backwards-compatible accessor for face authentication flag.
    func faceAuth() -> Bool? {
        let json = (try? toJson()) ?? "{}"
        let payload = (try? JSONDecoder().decode(RequestSnapshot.self, from: Data(json.utf8)))
        return payload?.faceAuth
    }
}

public extension Signal {
    /// Backwards-compatible factory for string signals.
    static func fromString(s: String) -> Signal {
        Signal.newFromString(s: s)
    }

    /// Backwards-compatible factory for ABI-encoded signals.
    static func fromAbiEncoded(bytes: Data) -> Signal {
        Signal.newFromAbiEncoded(bytes: bytes)
    }

    /// Backwards-compatible factory for ABI-encoded signals from byte arrays.
    static func fromAbiEncoded(bytes: [UInt8]) -> Signal {
        Signal.newFromAbiEncoded(bytes: Data(bytes))
    }

    /// Backwards-compatible accessor returning raw bytes.
    func asBytes() -> Data {
        bytes()
    }

    /// Backwards-compatible accessor returning string form.
    func asString() -> String? {
        string()
    }

    /// Backwards-compatible computed property returning the raw bytes as Data.
    var bytesData: Data { bytes() }

    /// Backwards-compatible computed property exposing the string form when available.
    var stringValue: String? { string() }
}
