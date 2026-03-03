import SwiftUI
import IDKit

enum SamplePreset: String, CaseIterable, Identifiable {
    case orbLegacy = "Orb (Legacy)"
    case secureDocumentLegacy = "Secure Document (Legacy)"
    case documentLegacy = "Document (Legacy)"
    case selfieCheckLegacy = "Selfie Check (Legacy)"
    case credentialCategoriesLegacy = "Credential Categories (Legacy)"

    var isLegacy: Bool {
        switch self {
        case .orbLegacy, .secureDocumentLegacy, .documentLegacy, .credentialCategoriesLegacy, .selfieCheckLegacy:
            return true
        }
    }

    var id: String { rawValue }
}

enum SampleEnvironment: String, CaseIterable, Identifiable {
    case production
    case staging

    var id: String { rawValue }
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

                    Picker("Preset", selection: $model.selectedPreset) {
                        ForEach(SamplePreset.allCases) { preset in
                            Text(preset.rawValue).tag(preset)
                        }
                    }

                    Picker("Environment", selection: $model.environment) {
                        ForEach(SampleEnvironment.allCases) { env in
                            Text(env.rawValue).tag(env)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                if model.selectedPreset == .credentialCategoriesLegacy {
                    Section("Credential Categories") {
                        ForEach([CredentialCategory.personhood, .secureDocument, .document], id: \.self) { cat in
                            Toggle(cat.displayName, isOn: Binding(
                                get: { model.selectedCredentialCategories.contains(cat) },
                                set: { on in
                                    if on { model.selectedCredentialCategories.insert(cat) }
                                    else { model.selectedCredentialCategories.remove(cat) }
                                }
                            ))
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
                        QRCodeView(url: connectorURL)
                            .frame(maxWidth: .infinity)
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
    @Published var selectedPreset: SamplePreset = .selfieCheckLegacy
    @Published var selectedCredentialCategories: Set<CredentialCategory> = [.personhood, .document, .secureDocument]
    @Published var environment: SampleEnvironment = .production
    @Published var connectorURL: URL?
    @Published var logs = ""
    @Published var isLoading = false

    private let signatureEndpoint = "https://tfh-takis.ngrok.dev/api/rp-signature"
    private let verifyEndpoint = "https://tfh-takis.ngrok.dev/api/verify-proof"
    private let returnToURL = "idkitsample://callback"

    private let session = URLSession.shared
    private var pendingRequest: IDKitRequest?
    private var completionTask: Task<Void, Never>?
    private var pollingRequestID: UUID?
    private var deepLinkReceivedForPendingRequest = false

    func buildPreset() -> Preset {
        switch selectedPreset {
        case .orbLegacy:
            return orbLegacy(signal: signal.isEmpty ? nil : signal)
        case .secureDocumentLegacy:
            return secureDocumentLegacy(signal: signal.isEmpty ? nil : signal)
        case .documentLegacy:
            return documentLegacy(signal: signal.isEmpty ? nil : signal)
        case .selfieCheckLegacy:
            return selfieCheckLegacy(signal: signal.isEmpty ? nil : signal)
        case .credentialCategoriesLegacy:
            let categories = [CredentialCategory.personhood, .secureDocument, .document]
                .filter { selectedCredentialCategories.contains($0) }
            return .credentialCategoriesLegacy(
                credentialCategories: categories.isEmpty ? [.personhood] : categories,
                signal: signal.isEmpty ? nil : signal
            )
        }
    }

    func generateRequestURL() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let rpContext: RpContext

            if selectedPreset.isLegacy {
                let signature = "0x" + String(repeating: "00", count: 64) + "1b"
                rpContext = try RpContext(
                    rpId: "rp_1234567890abcdef",
                    nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
                    createdAt: UInt64(Date().timeIntervalSince1970),
                    expiresAt: UInt64(Date().timeIntervalSince1970) + 3600,
                    signature: signature
                )
            } else {
                log("Fetching RP signature from \(signatureEndpoint)")
                let signaturePayload = try await fetchSignaturePayload()
                
                rpContext = try RpContext(
                    rpId: rpId,
                    nonce: signaturePayload.nonce,
                    createdAt: signaturePayload.createdAt,
                    expiresAt: signaturePayload.expiresAt,
                    signature: signaturePayload.sig
                )
            }

            let config = IDKitRequestConfig(
                appId: appId,
                action: action,
                rpContext: rpContext,
                actionDescription: "Local iOS sample",
                bridgeUrl: nil,
                allowLegacyProofs: false,
                overrideConnectBaseUrl: nil,
                environment: {
                    switch environment {
                    case .production: return .production
                    case .staging: return .staging
                    }
                }()
            )

            let request = try IDKit.request(config: config).preset(buildPreset())

            completionTask?.cancel()
            let connectorURLWithReturnTo = try addReturnTo(to: request.connectorURL)
            connectorURL = connectorURLWithReturnTo
            pendingRequest = request
            deepLinkReceivedForPendingRequest = false

            print("IDKit connector URL: \(connectorURLWithReturnTo.absoluteString)")
            log("Generated request ID: \(request.requestID.uuidString)")
            log("Added return_to callback: \(returnToURL)")
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
                        let shouldRetryConnectionFailure =
                            error == .connectionFailed &&
                            !deepLinkReceivedForPendingRequest &&
                            pendingRequest?.requestID == request.requestID

                        if shouldRetryConnectionFailure {
                            log("Bridge not ready yet (connection_failed). Retrying...")
                            try await Task.sleep(nanoseconds: pollIntervalNs)
                            continue
                        }

                        log("Proof completion failed: \(error.rawValue)")
                        return

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

extension CredentialCategory {
    var displayName: String {
        switch self {
        case .personhood: return "Personhood (Orb)"
        case .secureDocument: return "Secure Document"
        case .document: return "Document"
        }
    }
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
