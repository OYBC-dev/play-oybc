import SwiftUI

@main
struct PlayOYBCApp: App {
    @StateObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    /// The live backend, told about scene changes (nil in test runs).
    private let socketService: WebSocketGameService?

    init() {
        #if DEBUG
        // Unit and snapshot test runs host this app; they get a fake backend, never the network.
        if NSClassFromString("XCTestCase") != nil {
            socketService = nil
            _model = StateObject(wrappedValue: AppModel(service: FakeGameService(), store: ResumeStore(defaults: UserDefaults(suiteName: "tests") ?? .standard)))
            return
        }
        #endif
        FirebaseSession.configure()
        let service = WebSocketGameService(baseURL: WebSocketGameService.configuredBaseURL(), session: .shared)
        socketService = service
        // Kick off anonymous sign-in at launch; failures resurface on the first call.
        _Concurrency.Task { try? await FirebaseSession.shared.ensureSignedIn() }
        _model = StateObject(wrappedValue: AppModel(service: service))
    }

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
                // Background drops the game socket; foreground reconnects it.
                .onChange(of: scenePhase) { _, phase in socketService?.setActive(phase == .active) }
        }
    }
}
