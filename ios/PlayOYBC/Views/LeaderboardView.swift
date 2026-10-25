import SwiftUI

/// Announced bingos in the order they happened (web `Leaderboard`): rank, name, the player's
/// bingo-number pill (gold from #2) and the clock time, 56pt rows split by 1pt hairlines.
struct LeaderboardView: View {
    let bingos: [BingoDoc]
    /// Injected so snapshot tests render a fixed clock.
    var timeZone: TimeZone = .current

    var body: some View {
        if bingos.isEmpty {
            VStack(spacing: 14) {
                RisoMiniBoardArt()
                Text("No bingos yet").font(.risoHead(15, .bold)).foregroundStyle(Color.risoMuted)
            }
            .padding(.top, 28)
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
        } else {
            let sorted = bingos.sorted { $0.seq < $1.seq }
            VStack(spacing: 0) {
                ForEach(Array(sorted.enumerated()), id: \.element.seq) { i, b in
                    if i > 0 { Rectangle().fill(Color.risoHair).frame(height: 1) }
                    row(rank: i + 1, b)
                }
            }
        }
    }

    private func row(rank: Int, _ b: BingoDoc) -> some View {
        HStack(spacing: 12) {
            Text("\(rank)").font(.risoHead(20, .extraBold)).foregroundStyle(Color.risoMuted)
                .frame(width: 28, alignment: .leading)
            Text(b.name).font(.risoBody(16, .semibold)).foregroundStyle(Color.risoInk)
                .lineLimit(1).truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
            CountPill(number: b.playerBingoNumber)
            Text(LobbyLogic.clock(b.at, timeZone: timeZone))
                .font(.risoBody(14).monospacedDigit()).foregroundStyle(Color.risoMuted)
        }
        .frame(minHeight: 56)
        .accessibilityElement(children: .combine)
    }
}

/// "#N" capsule: 24pt, 2pt keyline, transparent for a player's first bingo and gold from the
/// second. Clipped to the capsule (a short capsule stroke draws flat stubs at its ends).
struct CountPill: View {
    let number: Int
    private var repeated: Bool { number >= 2 }

    var body: some View {
        Text("#\(number)")
            .font(.risoHead(13, .extraBold))
            .foregroundStyle(repeated ? Color.risoInkStatic : Color.risoInk)
            .padding(.horizontal, 8)
            .frame(minWidth: 36, minHeight: 24)
            .background(Capsule().fill(repeated ? Color.risoGold : Color.clear))
            .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            .clipShape(Capsule())
            .fixedSize()
    }
}
