import SwiftUI

/// Every player as a 38pt chip in join order; the host's chip carries the Host badge
/// (web `PlayerList`). Chips size to the name (names cap at 20 characters on Join).
struct PlayerListView: View {
    let snapshot: GameSnapshot

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(LobbyLogic.seatsByJoin(snapshot.seats)) { seat in
                HStack(spacing: 8) {
                    Text(seat.name)
                        .font(.risoHead(14, .bold))
                        .foregroundStyle(Color.risoInk)
                        .lineLimit(1)
                    if seat.seatId == snapshot.game.hostSeatId { RisoBadge("Host", kind: .expiring) }
                }
                .padding(.horizontal, 12)
                .frame(height: 38)
                .background(Capsule().fill(Color.risoPaper2))
                .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
                // Clip to the capsule: short capsule strokes draw flat stubs at their ends.
                .clipShape(Capsule())
                .fixedSize()
                .accessibilityElement(children: .combine)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Players")
    }
}
