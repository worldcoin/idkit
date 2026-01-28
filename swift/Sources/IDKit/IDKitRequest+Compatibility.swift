import Foundation

/// Type alias for public API - maps to generated IdKitRequestBuilder
public typealias IDKitRequestBuilder = IdKitRequestBuilder
/// Type alias for public API - maps to generated IdKitRequestConfig
public typealias IDKitRequestConfig = IdKitRequestConfig
/// Type alias for public API - maps to generated IdKitRequestWrapper
public typealias IDKitRequestWrapper = IdKitRequestWrapper
/// Type alias for backwards compatibility
public typealias IDKitRequest = IdKitRequestWrapper
/// Type alias for backwards compatibility - the generated type is StatusWrapper
public typealias Status = StatusWrapper

/// Errors surfaced by the high-level Swift conveniences.
public enum IDKitRequestError: Error, LocalizedError {
    case timeout
    case verificationFailed(String)
    case invalidURL(String)

    public var errorDescription: String? {
        switch self {
        case .timeout:
            return "Verification timed out before completing"
        case .verificationFailed(let reason):
            return "Verification failed: \(reason)"
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        }
    }
}

// MARK: - ProofData Extensions

public extension ProofData {
    /// Returns true if this is a V4 proof.
    var isV4: Bool {
        if case .v4 = self { return true }
        return false
    }

    /// Returns true if this is a Legacy proof.
    var isLegacy: Bool {
        if case .legacy = self { return true }
        return false
    }

    /// Gets the nullifier value regardless of proof type.
    var nullifier: String {
        switch self {
        case .v4(let proof, let nullifier, _, _, _):
            return nullifier
        case .legacy(_, _, let nullifierHash):
            return nullifierHash
        }
    }

    /// Gets the merkle root regardless of proof type.
    var merkleRoot: String {
        switch self {
        case .v4(_, _, let merkleRoot, _, _):
            return merkleRoot
        case .legacy(_, let merkleRoot, _):
            return merkleRoot
        }
    }

    /// Gets the proof string regardless of proof type.
    var proof: String {
        switch self {
        case .v4(let proof, _, _, _, _):
            return proof
        case .legacy(let proof, _, _):
            return proof
        }
    }
}

// MARK: - IdkitResponseItem Extensions

public extension IdkitResponseItem {
    /// Returns true if this response indicates success.
    var isSuccess: Bool {
        proofData != nil
    }

    /// Returns true if this response indicates an error.
    var isError: Bool {
        error != nil
    }
}

// MARK: - IDKitRequestWrapper Extensions

public extension IDKitRequestWrapper {
    /// Matches the IDKit v2 `status()` helper
    func status(pollInterval: TimeInterval = 3.0) -> AsyncThrowingStream<StatusWrapper, Error> {
        AsyncThrowingStream { continuation in
            let pollingTask = Task {
                var previousStatus: StatusWrapper?

                do {
                    while !Task.isCancelled {
                        let current = self.pollStatus(pollIntervalMs: nil, timeoutMs: nil)

                        if current != previousStatus {
                            previousStatus = current
                            continuation.yield(current)
                        }

                        switch current {
                        case .confirmed, .failed:
                            continuation.finish()
                            return
                        case .waitingForConnection, .awaitingConfirmation:
                            break
                        }

                        try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { _ in
                pollingTask.cancel()
            }
        }
    }

    /// Backwards-compatible alias for the IDKIT v3 async stream helper.
    func statusStream(pollInterval: TimeInterval = 3.0) -> AsyncThrowingStream<StatusWrapper, Error> {
        status(pollInterval: pollInterval)
    }

    /// Convenience accessor returning a URL instead of a string.
    var verificationURL: URL {
        let urlString = connectUrl()
        guard let url = URL(string: urlString) else {
            fatalError("Invalid connect URL generated: \(urlString)")
        }
        return url
    }

    var requestUUID: UUID {
        let raw = requestId()
        guard let uuid = UUID(uuidString: raw) else {
            fatalError("Invalid request ID generated: \(raw)")
        }
        return uuid
    }
}

// MARK: - StatusWrapper Convenience

public extension StatusWrapper {
    /// Returns the IDKitResult if this is a confirmed status, nil otherwise.
    var idkitResult: IdkitResult? {
        if case .confirmed(let result) = self {
            return result
        }
        return nil
    }
}
