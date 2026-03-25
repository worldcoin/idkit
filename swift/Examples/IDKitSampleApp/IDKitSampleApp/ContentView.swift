import SwiftUI
import IDKit

enum SampleEnvironment: String, CaseIterable, Identifiable {
    case production
    case staging

    var id: String { rawValue }
}

enum SampleLegacyPreset: String, CaseIterable, Identifiable {
    case orb
    case secureDocument = "secure document"
    case document
    case device
    case selfieCheck = "selfie check"

    var id: String { rawValue }

    func toPreset(signal: String) -> Preset {
        switch self {
        case .orb:
            orbLegacy(signal: signal)
        case .secureDocument:
            secureDocumentLegacy(signal: signal)
        case .document:
            documentLegacy(signal: signal)
        case .device:
            deviceLegacy(signal: signal)
        case .selfieCheck:
            selfieCheckLegacy(signal: signal)
        }
    }
}

struct ContentView: View {
    @StateObject private var model = SampleModel()

    var body: some View {
        NavigationView {
            Form {
                Section("Request") {
                    TextField("App ID", text: $model.appId)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .disabled(true)
                    TextField("RP ID", text: $model.rpId)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .disabled(true)
                    TextField("Action", text: $model.action)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                    TextField("Signal", text: $model.signal)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)

                    Picker("Environment", selection: $model.environment) {
                        ForEach(SampleEnvironment.allCases) { env in
                            Text(env.rawValue).tag(env)
                        }
                    }
                    .pickerStyle(.segmented)

                    Picker("Legacy preset", selection: $model.legacyPreset) {
                        ForEach(SampleLegacyPreset.allCases) { preset in
                            Text(preset.rawValue).tag(preset)
                        }
                    }
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
    @Published var appId = "app_d8bbd5341f16fb97a61e644b7e169c0e"
    @Published var rpId = "rp_7b4f23dd5fb2a826"
    @Published var action = "test-action"
    @Published var signal = "signal"
    @Published var environment: SampleEnvironment = .production
    @Published var legacyPreset: SampleLegacyPreset = .orb
    @Published var connectorURL: URL?
    @Published var logs = ""
    @Published var isLoading = false

    private let signatureEndpoint = "https://idkit-js-example.vercel.app/api/rp-signature"
    private let verifyEndpoint = "https://idkit-js-example.vercel.app/api/verify-proof"
    private let returnToURL = "idkitsample://callback"

    private let session = URLSession.shared
    private var pendingRequest: IDKitRequest?
    private var completionTask: Task<Void, Never>?
    private var pollingRequestID: UUID?
    private var deepLinkReceivedForPendingRequest = false

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
                returnTo: returnToURL,
                environment: {
                    switch environment {
                    case .production: return .production
                    case .staging: return .staging
                    }
                }(),
                connectUrlMode: nil
            )

            let request = try IDKit
                .request(config: config)
                .preset(legacyPreset.toPreset(signal: signal))

            completionTask?.cancel()
            connectorURL = request.connectorURL
            pendingRequest = request
            deepLinkReceivedForPendingRequest = false

            print("IDKit connector URL: \(request.connectorURL.absoluteString)")
            log("Using legacy preset: \(legacyPreset.rawValue)")
            log("Generated request ID: \(request.requestID.uuidString)")
            log("Configured return_to callback: \(returnToURL)")
            startPollingForRequest(request: request, reason: "request generation")
        } catch {
            log("Error: \(error.localizedDescription)")
        }
    }

    func handleDeepLink(_ url: URL) {
        print("IDKit deep link callback: \(url.absoluteString)")
        log("Received deep link callback: \(url.absoluteString)")

        guard let request = pendingRequest else {
            log("No pending request found. Generate a connector URL first.")
            return
        }

        deepLinkReceivedForPendingRequest = true

        if pollingRequestID == request.requestID {
            log("Polling already running for request \(request.requestID.uuidString).")
            return
        }

        startPollingForRequest(request: request, reason: "deep link callback")
    }

    private func startPollingForRequest(request: IDKitRequest, reason: String) {
        if pollingRequestID == request.requestID {
            return
        }

        completionTask?.cancel()
        pollingRequestID = request.requestID
        log("Started polling for request \(request.requestID.uuidString) (trigger: \(reason)).")

        completionTask = Task { @MainActor [weak self] in
            guard let self else { return }
            defer {
                if pollingRequestID == request.requestID {
                    pollingRequestID = nil
                }
            }

            let pollIntervalNs: UInt64 = 2_000_000_000
            let timeoutNs: UInt64 = 180_000_000_000
            let startedAt = DispatchTime.now().uptimeNanoseconds

            do {
                while true {
                    if Task.isCancelled {
                        return
                    }

                    if pollingRequestID != request.requestID {
                        return
                    }

                    let elapsedNs = DispatchTime.now().uptimeNanoseconds - startedAt
                    if elapsedNs >= timeoutNs {
                        log("Proof completion failed: timeout")
                        return
                    }

                    let status = await request.pollStatusOnce()

                    switch status {
                    case .confirmed(let result):
                        if pollingRequestID != request.requestID {
                            return
                        }

                        pendingRequest = nil
                        deepLinkReceivedForPendingRequest = false

                        do {
                            log("Proof confirmed. Calling verify endpoint: \(verifyEndpoint)")
                            let verifyResponse = try await verifyProof(result: result)
                            print("IDKit verify result: \(verifyResponse)")
                            log("Verify response: \(verifyResponse)")
                        } catch {
                            log("Verify request failed: \(error.localizedDescription)")
                        }
                        return

                    case .failed(let error):
                        log("Proof completion failed: \(error.rawValue)")
                        return

                    case .networkingError(let error):
                        log("Networking error (\(error.rawValue)), retrying...")
                        try await Task.sleep(nanoseconds: pollIntervalNs)

                    case .awaitingConfirmation, .waitingForConnection:
                        try await Task.sleep(nanoseconds: pollIntervalNs)
                    }
                }
            } catch {
                if pollingRequestID == request.requestID, !Task.isCancelled {
                    log("Polling error: \(error.localizedDescription)")
                }
            }
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

    private func log(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        logs += "[\(timestamp)] \(message)\n"
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
    case badResponse
    case verifyFailed(statusCode: Int, body: String)

    var errorDescription: String? {
        switch self {
        case .invalidURL(let raw):
            return "Invalid endpoint URL: \(raw)"
        case .badResponse:
            return "Backend returned a non-2xx response"
        case .verifyFailed(let statusCode, let body):
            return "Verify proof failed with status \(statusCode): \(body)"
        }
    }
}
