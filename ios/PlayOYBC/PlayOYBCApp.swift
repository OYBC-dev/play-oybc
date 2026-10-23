import SwiftUI

@main
struct PlayOYBCApp: App {
    init() {
        FirebaseGameService.configure()
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                RisoPaperBackground()
                Text("Play OYBC").risoH1()
            }
        }
    }
}
