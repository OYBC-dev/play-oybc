import SwiftUI

/// After the host ends the game: the leaderboard and your final board (web `EndedScreen`).
/// iOS adds Home, since there is no address bar to leave by.
struct EndedView: View {
    let service: GameService
    let snapshot: GameSnapshot
    let gameId: String
    var onHome: () -> Void = {}
    var timeZone: TimeZone = .current

    var body: some View {
        RisoPage {
            if snapshot.game.hostSeatId == snapshot.mySeatId {
                ReclaimPromptView(service: service, gameId: gameId, reclaims: snapshot.reclaims)
            }
            SectionLabel("Leaderboard")
            LeaderboardView(bingos: snapshot.bingos, timeZone: timeZone)
            if let board = snapshot.board {
                SectionLabel("Your board")
                BoardGridView(board: board, readOnly: true)
            }
            RisoButton(title: "Home", fullWidth: true, action: onHome)
        }
        .accessibilityIdentifier("stage-ended")
    }
}
