import SwiftUI

@main
struct PlayOYBCApp: App {
    @StateObject private var model: AppModel

    init() {
        FirebaseGameService.configure()
        let service = FirebaseGameService.shared
        // Kick off anonymous sign-in at launch; failures resurface on the first call.
        _Concurrency.Task { try? await service.ensureSignedIn() }
        _model = StateObject(wrappedValue: AppModel(service: service))
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                RisoPaperBackground()
                Text("Play OYBC").risoH1()
            }
            .task { await model.launch() }
        }
    }
}
