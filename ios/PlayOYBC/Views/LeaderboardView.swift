import SwiftUI

/// Announced bingos in the order they happened (web `Leaderboard`).
struct LeaderboardView: View {
    let bingos: [BingoDoc]
    /// Injected so snapshot tests render a fixed clock.
    var timeZone: TimeZone = .current

    var body: some View {
        if bingos.isEmpty {
            MutedText("No bingos yet")
        } else {
            VStack(spacing: 6) {
                ForEach(Array(bingos.sorted { $0.seq < $1.seq }.enumerated()), id: \.element.seq) { i, b in
                    HStack(spacing: 10) {
                        Text("\(i + 1)").font(.risoHead(18, .extraBold)).foregroundStyle(Color.risoInk)
                            .frame(width: 28, alignment: .leading)
                        Text(b.name).font(.risoBody(15, .bold)).foregroundStyle(Color.risoInk)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("#\(b.playerBingoNumber)").font(.risoHead(15, .extraBold)).foregroundStyle(Color.risoBlue)
                        Text(LobbyLogic.clock(b.at, timeZone: timeZone))
                            .font(.risoBody(15).monospacedDigit()).foregroundStyle(Color.risoMuted)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .frame(minHeight: 44)
                    .risoCard()
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}
