import SwiftUI

@main
struct PlayOYBCApp: App {
    @StateObject private var model: AppModel

    /// Unit and snapshot test runs host this app; they get a fake backend, never Firebase.
    static let isRunningTests = NSClassFromString("XCTestCase") != nil

    init() {
        if Self.isRunningTests {
            _model = StateObject(wrappedValue: AppModel(service: FakeGameService(), store: ResumeStore(defaults: UserDefaults(suiteName: "tests") ?? .standard)))
            return
        }
        FirebaseGameService.configure()
        let service = FirebaseGameService.shared
        // Kick off anonymous sign-in at launch; failures resurface on the first call.
        _Concurrency.Task { try? await service.ensureSignedIn() }
        _model = StateObject(wrappedValue: AppModel(service: service))
    }

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
                .task { await model.launch() }
        }
    }
}
