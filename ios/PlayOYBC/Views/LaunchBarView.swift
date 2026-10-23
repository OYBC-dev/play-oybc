import SwiftUI

/// Host-only: pool counter, who still needs tasks, and Launch once everyone is ready (web `LaunchBar`).
struct LaunchBarView: View {
    let snapshot: GameSnapshot
    let onLaunch: () async throws -> Void
    @State var busy = false
    @State var error: String?

    var body: some View {
        let lines = LobbyLogic.shortfallLines(game: snapshot.game, seats: snapshot.seats)
        let pool = snapshot.view.count
        let ready = lines.isEmpty && pool >= GameConstants.minPoolSize
        VStack(alignment: .leading, spacing: 8) {
            Text("\(pool) / \(GameConstants.minPoolSize)")
                .font(.risoHead(20, .extraBold))
                .foregroundStyle(Color.risoInk)
                .accessibilityLabel("Pool size \(pool) of \(GameConstants.minPoolSize)")
            if !lines.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(lines, id: \.self) { Text($0).font(.risoBody(15, .semibold)).foregroundStyle(Color.risoMuted) }
                }
            }
            if let error { ErrorText(error) }
            RisoButton(title: "Launch", kind: .green, fullWidth: true, large: true) { launch() }
                .risoDisabled(!ready || busy)
        }
    }

    private func launch() {
        busy = true
        error = nil
        _Concurrency.Task {
            do { try await onLaunch() } catch { self.error = ErrorMessages.message(for: error) }
            busy = false
        }
    }
}
