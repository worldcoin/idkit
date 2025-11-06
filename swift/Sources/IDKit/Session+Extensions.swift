import Foundation

extension Session {
    /// Creates an async stream that polls for status updates
    ///
    /// This method returns an `AsyncThrowingStream` that polls the bridge for status updates
    /// every 3 seconds until the verification is complete or fails.
    ///
    /// - Returns: An async throwing stream of Status updates
    ///
    /// ## Example
    /// ```swift
    /// let session = try Session.create(appId: "app_123", action: "verify", requests: [request])
    ///
    /// for try await status in session.statusStream() {
    ///     switch status {
    ///     case .waitingForConnection:
    ///         print("Waiting for user to scan QR code...")
    ///     case .awaitingConfirmation:
    ///         print("User scanned QR, awaiting confirmation...")
    ///     case .confirmed(let proof):
    ///         print("Verification successful!")
    ///         return proof
    ///     case .failed(let error):
    ///         throw SessionError.verificationFailed(error)
    ///     }
    /// }
    /// ```
    public func statusStream() -> AsyncThrowingStream<Status, Error> {
        AsyncThrowingStream { continuation in
            Task {
                let pollInterval: TimeInterval = 3.0
                let timeout: TimeInterval = 900.0 // 15 minutes
                let startTime = Date()

                while true {
                    // Check timeout
                    if Date().timeIntervalSince(startTime) > timeout {
                        continuation.finish(throwing: SessionError.timeout)
                        return
                    }

                    do {
                        let status = try self.poll()
                        continuation.yield(status)

                        // End stream on terminal states
                        switch status {
                        case .confirmed, .failed:
                            continuation.finish()
                            return
                        case .waitingForConnection, .awaitingConfirmation:
                            // Continue polling
                            break
                        }

                        // Wait before next poll
                        try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
                    } catch {
                        continuation.finish(throwing: error)
                        return
                    }
                }
            }
        }
    }

    /// Async version of waitForProof that uses Swift concurrency
    ///
    /// - Parameter timeout: Optional timeout in seconds (defaults to 15 minutes)
    /// - Returns: The verified proof
    /// - Throws: SessionError if verification fails or times out
    public func waitForProofAsync(timeout: TimeInterval = 900) async throws -> Proof {
        return try await withCheckedThrowingContinuation { continuation in
            Task {
                do {
                    let proof = try self.waitForProofWithTimeout(timeoutSeconds: UInt64(timeout))
                    continuation.resume(returning: proof)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    /// Returns the verification URL as a URL object
    public var verificationURL: URL {
        guard let url = URL(string: self.connectUrl()) else {
            fatalError("Invalid connect URL generated: \(self.connectUrl())")
        }
        return url
    }

    /// Returns the request ID as a UUID
    public var requestUUID: UUID {
        guard let uuid = UUID(uuidString: self.requestId()) else {
            fatalError("Invalid request ID generated: \(self.requestId())")
        }
        return uuid
    }
}

/// Errors that can occur during session operations
public enum SessionError: Error, LocalizedError {
    case timeout
    case verificationFailed(String)
    case invalidURL(String)
    case emptyRequests
    case invalidAppID(String)

    public var errorDescription: String? {
        switch self {
        case .timeout:
            return "Verification request timed out after 15 minutes"
        case .verificationFailed(let reason):
            return "Verification failed: \(reason)"
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        case .emptyRequests:
            return "At least one request is required"
        case .invalidAppID(let appId):
            return "Invalid app ID: \(appId)"
        }
    }
}
