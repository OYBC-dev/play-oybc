import SwiftUI

/// The pre-game lobby (web `LobbyScreen`): share, players, live pool, task entry, and (host) launch.
struct LobbyView: View {
    let service: GameService
    let snapshot: GameSnapshot
    let gameId: String
    @State var deleting: Set<String> = []
    @State var deleteError: String?

    private var isHost: Bool { snapshot.game.hostSeatId == snapshot.mySeatId }

    var body: some View {
        RisoPage {
            if isHost { ReclaimPromptView(service: service, gameId: gameId, reclaims: snapshot.reclaims) }
            ShareView(code: snapshot.game.code, isHost: isHost)
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Players")
                PlayerListView(snapshot: snapshot)
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Pool")
                PoolListView(entries: snapshot.view, isHost: isHost, deleting: deleting) { remove($0) }
                if let deleteError { ErrorText(deleteError) }
                AddTaskView(service: service, gameId: gameId,
                            seatNames: LobbyLogic.seatsByJoin(snapshot.seats).filter { $0.seatId != snapshot.mySeatId }.map(\.name))
            }
            HostMenuView(service: service, gameId: gameId, snapshot: snapshot)
            if isHost {
                LaunchBarView(snapshot: snapshot) { try await service.launch(gameId: gameId) }
            }
        }
        .accessibilityIdentifier("stage-lobby")
    }

    private func remove(_ id: String) {
        deleteError = nil
        deleting.insert(id)
        _Concurrency.Task {
            do { try await service.deleteTask(gameId: gameId, taskId: id) }
            catch { deleteError = ErrorMessages.message(for: error) }
            deleting.remove(id)
        }
    }
}
