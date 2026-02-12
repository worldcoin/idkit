import SwiftUI
import IDKit

struct ContentView: View {
    @StateObject private var model = SampleModel()

    var body: some View {
        NavigationView {
            Form {
                Section("Backend") {
                    TextField("RP signature endpoint", text: $model.signatureEndpoint)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                    TextField("Verify proof endpoint", text: $model.verifyEndpoint)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                }

                Section("Request") {
                    TextField("App ID", text: $model.appId)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                    TextField("RP ID", text: $model.rpId)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                    TextField("Action", text: $model.action)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                    TextField("Signal", text: $model.signal)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                    TextField("Return to URL", text: $model.returnToURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                }

                Section {
                    Button {
                        Task {
                            await model.generateRequestURL()
                        }
                    } label: {
                        Text(model.isLoading ? "Generating..." : "Generate Connector URL")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(model.isLoading)
                }

                if let connectorURL = model.connectorURL {
                    Section("Connector URL") {
                        Link(destination: connectorURL) {
                            Label("Open Connector URL", systemImage: "link")
                        }
                        Text(connectorURL.absoluteString)
                            .font(.footnote.monospaced())
                            .textSelection(.enabled)
                    }
                }

                Section("Logs") {
                    ScrollView {
                        Text(model.logs)
                            .font(.footnote.monospaced())
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(minHeight: 180)
                }
            }
            .navigationTitle("IDKit Sample")
            .onOpenURL { url in
                model.handleDeepLink(url)
            }
        }
    }
}

@MainActor
final class SampleModel: ObservableObject {
    // **Note**: Update this to an ngrok/hosted backend server
    // For an example backend implementation, see: js/examples/browser/src/server.ts
    @Published var signatureEndpoint = "http://localhost:3000/api/rp-signature"
    @Published var verifyEndpoint = "http://localhost:3000/api/verify-proof"
    @Published var appId = "app_982a2852d071269417befc64ab3981c2"
    @Published var rpId = "rp_45a9b5d97996bb9a"
    @Published var action = "test-action"
    @Published var signal = "signal"
    @Published var returnToURL = "idkitsample://callback" // Deeplink to redirect back to your app
    @Published var connectorURL: URL?
    @Published var logs = ""
    @Published var isLoading = false

    private let session = URLSession.shared
    private var pendingRequest: IDKitRequest?
    private var completionTask: Task<Void, Never>?

    func generateRequestURL() async {
        isLoading = true
        defer { isLoading = false }

        do {
            log("Fetching RP signature from \(signatureEndpoint)")
            let signaturePayload = try await fetchSignaturePayload()

            let rpContext = try RpContext(
                rpId: rpId,
                nonce: signaturePayload.nonce,
                createdAt: signaturePayload.createdAt,
                expiresAt: signaturePayload.expiresAt,
                signature: signaturePayload.sig
            )

            let config = IDKitRequestConfig(
                appId: appId,
                action: action,
                rpContext: rpContext,
                actionDescription: "Local iOS sample",
                bridgeUrl: nil,
                allowLegacyProofs: false,
                overrideConnectBaseUrl: nil,
                // Use production to use with World App
                // or staging to use with simulator.world.org
                environment: .production
            )

            let request = try IDKit.request(config: config).preset(orbLegacy(signal: signal))
            let connectorURLWithReturnTo = try addReturnTo(to: request.connectorURL)
            connectorURL = connectorURLWithReturnTo
            pendingRequest = request

            // Explicitly print to console so local Xcode runs can quickly validate setup.
            print("IDKit connector URL: \(connectorURLWithReturnTo.absoluteString)")
            log("Generated request ID: \(request.requestID.uuidString)")
            log("Added return_to callback: \(returnToURL)")
            log("Waiting for deep link callback before polling for completion.")
            log("Connector URL printed to Xcode console.")
        } catch {
            log("Error: \(error.localizedDescription)")
        }
    }

    func handleDeepLink(_ url: URL) {
        print("IDKit deep link callback: \(url.absoluteString)")
        log("Received deep link callback: \(url.absoluteString)")

        completionTask?.cancel()
        completionTask = Task { [weak self] in
            await self?.pollAndVerifyPendingRequest()
        }
    }

    private func fetchSignaturePayload() async throws -> SignaturePayload {
        guard let url = URL(string: signatureEndpoint) else {
            throw SampleError.invalidURL(signatureEndpoint)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(SignatureRequest(action: action, ttl: nil))

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SampleError.badResponse
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(SignaturePayload.self, from: data)
    }

    private func log(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        logs += "[\(timestamp)] \(message)\n"
    }

    private func pollAndVerifyPendingRequest() async {
        guard let request = pendingRequest else {
            log("No pending request found. Generate a connector URL first.")
            return
        }

        log("Polling for completion...")
        let completion = await request.pollUntilCompletion(
            options: .init(pollIntervalMs: 2_000, timeoutMs: 180_000)
        )

        switch completion {
        case .success(let result):
            do {
                log("Proof confirmed. Calling verify endpoint: \(verifyEndpoint)")
                let verifyResponse = try await verifyProof(result: result)
                print("IDKit verify result: \(verifyResponse)")
                log("Verify response: \(verifyResponse)")
            } catch {
                log("Verify request failed: \(error.localizedDescription)")
            }

        case .failure(let error):
            log("Proof completion failed: \(error.rawValue)")
        }
    }

    private func verifyProof(result: IDKitResult) async throws -> String {
        guard let url = URL(string: verifyEndpoint) else {
            throw SampleError.invalidURL(verifyEndpoint)
        }

        let devPortalPayloadJSON = try idkitResultToJson(result: result)
        let payloadObject = try JSONSerialization.jsonObject(with: Data(devPortalPayloadJSON.utf8))
        let requestObject: [String: Any] = [
            "rp_id": rpId,
            "devPortalPayload": payloadObject
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestObject)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SampleError.badResponse
        }

        let responseBody = prettifyJSON(data) ?? String(data: data, encoding: .utf8) ?? "<non-utf8 response>"
        guard (200..<300).contains(http.statusCode) else {
            throw SampleError.verifyFailed(statusCode: http.statusCode, body: responseBody)
        }

        return responseBody
    }

    private func prettifyJSON(_ data: Data) -> String? {
        guard
            let object = try? JSONSerialization.jsonObject(with: data),
            JSONSerialization.isValidJSONObject(object),
            let formatted = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted]),
            let string = String(data: formatted, encoding: .utf8)
        else {
            return nil
        }
        return string
    }

    private func addReturnTo(to connectorURL: URL) throws -> URL {
        let trimmedReturnTo = returnToURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedReturnTo.isEmpty else {
            return connectorURL
        }

        guard URL(string: trimmedReturnTo) != nil else {
            throw SampleError.invalidReturnToURL(trimmedReturnTo)
        }

        guard var components = URLComponents(url: connectorURL, resolvingAgainstBaseURL: false) else {
            throw SampleError.invalidConnectorURL(connectorURL.absoluteString)
        }

        var queryItems = components.queryItems ?? []
        queryItems.removeAll(where: { $0.name == "return_to" })
        queryItems.append(URLQueryItem(name: "return_to", value: trimmedReturnTo))
        components.queryItems = queryItems

        guard let finalURL = components.url else {
            throw SampleError.invalidConnectorURL(connectorURL.absoluteString)
        }

        return finalURL
    }
}

private struct SignaturePayload: Decodable {
    let sig: String
    let nonce: String
    let createdAt: UInt64
    let expiresAt: UInt64
}

private struct SignatureRequest: Encodable {
    let action: String
    let ttl: UInt64?
}

private enum SampleError: LocalizedError {
    case invalidURL(String)
    case invalidConnectorURL(String)
    case invalidReturnToURL(String)
    case badResponse
    case verifyFailed(statusCode: Int, body: String)

    var errorDescription: String? {
        switch self {
        case .invalidURL(let raw):
            return "Invalid endpoint URL: \(raw)"
        case .invalidConnectorURL(let raw):
            return "Invalid connector URL: \(raw)"
        case .invalidReturnToURL(let raw):
            return "Invalid return_to URL: \(raw)"
        case .badResponse:
            return "Backend returned a non-2xx response"
        case .verifyFailed(let statusCode, let body):
            return "Verify proof failed with status \(statusCode): \(body)"
        }
    }
}
