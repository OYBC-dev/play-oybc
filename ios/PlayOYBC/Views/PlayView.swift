import SwiftUI

/// The live game (web `PlayScreen`): your board, bingo banners, the leaderboard sheet, and for
/// the host the host menu and End game.
struct PlayView: View {
    enum SheetKind: String, Identifiable { case leaderboard, end; var id: String { rawValue } }

    let service: GameService
    let snapshot: GameSnapshot
    let gameId: String
    var banner: BingoDoc?
    var pendingCells: Set<Int> = []
    var toggleError: String?
    var onToggle: (Int) -> Void = { _ in }
    var onDismissBanner: () -> Void = {}
    var timeZone: TimeZone = .current

    @State var sheet: SheetKind?
    @State var ending = false
    @State var endError: String?

    private var isHost: Bool { snapshot.game.hostSeatId == snapshot.mySeatId }

    var body: some View {
        ZStack(alignment: .top) {
            RisoPage {
                if isHost { ReclaimPromptView(service: service, gameId: gameId, reclaims: snapshot.reclaims) }
                HStack(spacing: 8) {
                    RisoButton(title: "Leaderboard", small: true) { sheet = .leaderboard }
                    Spacer(minLength: 0)
                    HostMenuView(service: service, gameId: gameId, snapshot: snapshot)
                    if isHost {
                        Spacer(minLength: 0)
                        RisoButton(title: "End game", kind: .primary, small: true) { endError = nil; sheet = .end }
                    }
                }
                if let board = snapshot.board {
                    BoardGridView(board: board, pending: pendingCells, error: toggleError, onToggle: onToggle)
                } else {
                    MutedText("Loading")
                }
            }
            BingoBannerView(bingo: banner, onDismiss: onDismissBanner)
                .padding(.top, 12)
                .animation(.spring(duration: 0.35), value: banner?.seq)
        }
        .accessibilityIdentifier("stage-playing")
        .sheet(item: $sheet) { kind in
            switch kind {
            case .leaderboard:
                RisoSheet(title: "Leaderboard", onClose: { sheet = nil }) {
                    LeaderboardView(bingos: snapshot.bingos, timeZone: timeZone)
                }
            case .end:
                RisoSheet(title: "End game", onClose: { sheet = nil }) {
                    Text("Everyone will see the final leaderboard.").font(.risoBody(16)).foregroundStyle(Color.risoInk)
                    if let endError { ErrorText(endError) }
                    HStack(spacing: 8) {
                        RisoButton(title: "Cancel", fullWidth: true) { sheet = nil }
                        RisoButton(title: "End game", kind: .primary, fullWidth: true) { end() }
                            .risoDisabled(ending)
                    }
                }
            }
        }
    }

    private func end() {
        ending = true
        endError = nil
        _Concurrency.Task {
            do {
                try await service.end(gameId: gameId)
                sheet = nil
            } catch {
                endError = ErrorMessages.message(for: error)
            }
            ending = false
        }
    }
}
