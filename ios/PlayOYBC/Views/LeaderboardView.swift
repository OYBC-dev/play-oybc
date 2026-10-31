import SwiftUI

/// The server-ranked standings (web `Leaderboard`): rank, name over a muted "{marked} squares"
/// meta line (plus "· {bestLine} in a row" before a first bingo), and the "{n} bingos" pill
/// (hidden at 0), rows split by 1pt hairlines.
struct LeaderboardView: View {
    /// Server order; one row per entry.
    let standings: [Standing]

    var body: some View {
        if standings.isEmpty {
            VStack(spacing: 14) {
                RisoMiniBoardArt()
                Text("No bingos yet").font(.risoHead(15, .bold)).foregroundStyle(Color.risoMuted)
            }
            .padding(.top, 28)
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(standings.enumerated()), id: \.element.seatId) { i, s in
                    if i > 0 { Rectangle().fill(Color.risoHair).frame(height: 1) }
                    row(rank: i + 1, s)
                }
            }
        }
    }

    private func row(rank: Int, _ s: Standing) -> some View {
        HStack(spacing: 12) {
            Text("\(rank)").font(.risoHead(20, .extraBold)).foregroundStyle(Color.risoMuted)
                .frame(width: 28, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(s.name).font(.risoBody(16, .semibold)).foregroundStyle(Color.risoInk)
                    .lineLimit(1).truncationMode(.tail)
                Text(LobbyLogic.standingMeta(s)).font(.risoBody(12.5, .semibold)).foregroundStyle(Color.risoMuted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let pill = LobbyLogic.bingoPill(s.bingos) { CountPill(text: pill) }
        }
        .padding(.vertical, 8)
        .frame(minHeight: 56)
        .accessibilityElement(children: .combine)
    }
}

/// Gold capsule with ink-static text: 24pt, 2pt keyline. Clipped to the capsule (a short
/// capsule stroke draws flat stubs at its ends).
struct CountPill: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.risoHead(13, .extraBold))
            .foregroundStyle(Color.risoInkStatic)
            .padding(.horizontal, 10)
            .frame(minWidth: 36, minHeight: 24)
            .background(Capsule().fill(Color.risoGold))
            .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            .clipShape(Capsule())
            .fixedSize()
    }
}
