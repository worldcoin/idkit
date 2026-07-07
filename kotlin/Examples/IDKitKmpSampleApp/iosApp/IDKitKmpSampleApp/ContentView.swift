import SwiftUI
import SampleShared

/// Bridges the shared Kotlin `SampleController` (StateFlow) into SwiftUI.
@MainActor
final class SampleViewModel: ObservableObject {
    @Published private(set) var state = SampleUiState(
        appId: "", rpId: "", action: "", signal: "",
        environment: .production, preset: .device,
        connectorUrl: nil, isLoading: false, logs: ""
    )

    private let controller = SampleController()

    init() {
        state = controller.state.value as! SampleUiState
        controller.watchState { [weak self] newState in
            self?.state = newState
        }
    }

    deinit {
        controller.dispose()
    }

    func setAction(_ value: String) { controller.setAction(value: value) }
    func setSignal(_ value: String) { controller.setSignal(value: value) }
    func setEnvironment(_ value: SampleEnvironment) { controller.setEnvironment(value: value) }
    func setPreset(_ value: SamplePreset) { controller.setPreset(value: value) }
    func generateRequest() { controller.generateRequest() }
    func handleDeepLink(_ url: URL) { controller.handleDeepLink(url: url.absoluteString) }
}

struct ContentView: View {
    @StateObject private var model = SampleViewModel()
    // Qualified: the shared framework also exports IDKit's `Environment` enum.
    @SwiftUI.Environment(\.openURL) private var openURL

    var body: some View {
        NavigationView {
            Form {
                Section("Request") {
                    HStack {
                        Text("App ID")
                        Spacer()
                        Text(model.state.appId)
                            .font(.footnote.monospaced())
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Text("RP ID")
                        Spacer()
                        Text(model.state.rpId)
                            .font(.footnote.monospaced())
                            .foregroundColor(.secondary)
                    }
                    TextField("Action", text: Binding(
                        get: { model.state.action },
                        set: { model.setAction($0) }
                    ))
                    TextField("Signal", text: Binding(
                        get: { model.state.signal },
                        set: { model.setSignal($0) }
                    ))
                    Picker("Environment", selection: Binding(
                        get: { model.state.environment },
                        set: { model.setEnvironment($0) }
                    )) {
                        Text("production").tag(SampleEnvironment.production)
                        Text("staging").tag(SampleEnvironment.staging)
                    }
                    Picker("Preset", selection: Binding(
                        get: { model.state.preset },
                        set: { model.setPreset($0) }
                    )) {
                        Text("orb").tag(SamplePreset.orb)
                        Text("secure document").tag(SamplePreset.secureDocument)
                        Text("document").tag(SamplePreset.document)
                        Text("device").tag(SamplePreset.device)
                        Text("selfie check").tag(SamplePreset.selfieCheck)
                        Text("identity check").tag(SamplePreset.identityCheck)
                    }
                }

                Section {
                    Button(model.state.isLoading ? "Generating..." : "Generate Connector URL") {
                        model.generateRequest()
                    }
                    .disabled(model.state.isLoading)
                }

                if let connectorUrl = model.state.connectorUrl {
                    Section("Connector URL") {
                        Button("Open Connector URL") {
                            if let url = URL(string: connectorUrl) {
                                openURL(url)
                            }
                        }
                        Text(connectorUrl)
                            .font(.footnote.monospaced())
                            .textSelection(.enabled)
                    }
                }

                Section("Logs") {
                    Text(model.state.logs.isEmpty ? "No logs yet." : model.state.logs)
                        .font(.footnote.monospaced())
                        .frame(maxWidth: .infinity, minHeight: 180, alignment: .topLeading)
                        .textSelection(.enabled)
                }
            }
            .navigationTitle("IDKit KMP Sample")
        }
        .onOpenURL { url in
            model.handleDeepLink(url)
        }
    }
}
