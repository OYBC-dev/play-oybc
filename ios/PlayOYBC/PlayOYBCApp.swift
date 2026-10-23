import SwiftUI

@main
struct PlayOYBCApp: App {
    @StateObject private var model: AppModel

    init() {
        #if DEBUG
        // Unit and snapshot test runs host this app; they get a fake backend, never Firebase.
        if NSClassFromString("XCTestCase") != nil {
            _model = StateObject(wrappedValue: AppModel(service: FakeGameService(), store: ResumeStore(defaults: UserDefaults(suiteName: "tests") ?? .standard)))
            return
        }
        #endif
        FirebaseGameService.configure()
        let service = FirebaseGameService.shared
        // Kick off anonymous sign-in at launch; failures resurface on the first call.
        _Concurrency.Task { try? await service.ensureSignedIn() }
        _model = StateObject(wrappedValue: AppModel(service: service))
    }

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
        }
    }
}
