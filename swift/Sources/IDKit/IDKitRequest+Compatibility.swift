import Foundation

/// Type alias for backwards compatibility - the generated type is IDKitRequestWrapper
public typealias IDKitRequest = IDKitRequestWrapper
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
