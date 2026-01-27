import Foundation

/// Type alias for backwards compatibility - the generated type is SessionWrapper
public typealias Session = SessionWrapper
/// Type alias for backwards compatibility - the generated type is StatusWrapper
public typealias Status = StatusWrapper

/// Errors surfaced by the high-level Swift conveniences.
public enum SessionError: Error, LocalizedError {
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

// MARK: - IdkitResult Extensions

public extension IdkitResult {
    /// Returns the first successful response item, if any.
    func firstSuccessful() -> IdkitResponseItem? {
        responses.first { $0.isSuccess }
    }

    /// Returns all successful response items.
    func allSuccessful() -> [IdkitResponseItem] {
        responses.filter { $0.isSuccess }
    }

    /// Returns true if all responses are successful.
    func isAllSuccessful() -> Bool {
        !responses.isEmpty && responses.allSatisfy { $0.isSuccess }
    }

    /// Returns true if at least one response is successful.
    func hasAnySuccessful() -> Bool {
        responses.contains { $0.isSuccess }
    }

    /// Returns the count of successful responses.
    func successCount() -> Int {
        responses.filter { $0.isSuccess }.count
    }

    /// Returns the count of failed responses.
    func failureCount() -> Int {
        responses.filter { $0.isError }.count
    }
}

// MARK: - SessionWrapper Extensions

public extension SessionWrapper {
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
