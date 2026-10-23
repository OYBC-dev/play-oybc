import SwiftUI

/// Everyone in the game in join order, host and you marked (web `PlayerList`).
struct PlayerListView: View {
    let snapshot: GameSnapshot

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(LobbyLogic.seatsByJoin(snapshot.seats)) { seat in
                HStack(spacing: 6) {
                    Text(seat.name).font(.risoBody(15, .bold)).foregroundStyle(Color.risoInk)
                    if seat.seatId == snapshot.game.hostSeatId { badge("Host") }
                    if seat.seatId == snapshot.mySeatId { badge("You") }
                }
                .padding(.horizontal, 12)
                .frame(minHeight: 36)
                // Radius under half the height: a true capsule stroke renders with flat-edge
                // artifacts in snapshot rendering.
                .risoCard(radius: 14, fill: .risoPaper2)
                .fixedSize()
                .accessibilityElement(children: .combine)
            }
        }
        .accessibilityLabel("Players")
    }

    private func badge(_ text: String) -> some View {
        Text(text)
            .font(.risoBody(11, .extraBold))
            .tracking(0.66)
            .textCase(.uppercase)
            .foregroundStyle(Color.risoInkStatic)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 7).fill(Color.risoGold))
    }
}
