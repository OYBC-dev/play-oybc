import SwiftUI

/// After the host ends the game (web `EndedScreen`): "Ended · CODE" kicker over the game name (or
/// "Final leaderboard" when the host set none), the final
/// leaderboard, your final board read-only, and New game. The host's reclaim toast is
/// mounted over every stage by `GameView`.
struct EndedView: View {
    let snapshot: GameSnapshot
    var onHome: () -> Void = {}

    var body: some View {
        RisoPage(gutter: Riso.gutter, top: 10) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Ended · \(snapshot.game.code)").risoKicker().accessibilityAddTraits(.isHeader)
                if let gameName = snapshot.game.gameName, !gameName.isEmpty {
                    Text(gameName)
                        .font(.risoHead(26, .extraBold)).tracking(-0.52)
                        .foregroundStyle(Color.risoInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("game-name")
                } else {
                    Text("Final leaderboard")
                        .font(.risoHead(30, .extraBold)).tracking(-0.6)
                        .foregroundStyle(Color.risoInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            LeaderboardView(standings: snapshot.standings)
                .padding(Riso.cardPadding)
                .risoCard()
                .risoHardShadow(Riso.Shadow.card)
            if let board = snapshot.board {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Your board")
                    BoardGridView(board: board, readOnly: true)
                }
            }
            RisoButton(title: "New game", kind: .dark, fullWidth: true, action: onHome)
                .accessibilityIdentifier("new-game")
        }
        .accessibilityIdentifier("stage-ended")
    }
}
