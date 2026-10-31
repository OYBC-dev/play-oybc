import SwiftUI

/// Every player as a 38pt chip in join order; the host's chip carries the Host badge
/// (web `PlayerList`). Chips size to the name (names cap at 20 characters on Join).
///
/// Then one dashed chip per roster name nobody carries yet; a roster name the host bound to a
/// player shows as a muted uppercase tag on that player's chip. For the host (`onOpen` set) the
/// dashed chips and tagged chips are buttons that open the bind sheet for that name; a chip with
/// several bound names opens a menu of them first. Those buttons get 3pt of hit slop (44pt tall)
/// without moving the layout.
struct PlayerListView: View {
    let snapshot: GameSnapshot
    /// Host only: opens the bind sheet for a roster key. Nil = the chips are static.
    var onOpen: ((String) -> Void)?

    private static let chipHeight: CGFloat = 38
    /// Pads 38pt chips to a 44pt tap target.
    private static let hitSlop: CGFloat = 3

    private var roster: [RosterName] { snapshot.roster }
    private var unbound: [RosterName] { roster.filter { $0.seatId == nil } }

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(LobbyLogic.seatsByJoin(snapshot.seats)) { seat in
                playerChip(seat, bound: roster.filter { $0.seatId == seat.seatId })
            }
            ForEach(unbound) { name in
                interactive(keys: [name]) { unboundChip(name) }
                    .accessibilityLabel(name.display)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Players")
    }

    private func playerChip(_ seat: Seat, bound: [RosterName]) -> some View {
        interactive(keys: bound) {
            HStack(spacing: 8) {
                Text(seat.name)
                    .font(.risoHead(14, .bold))
                    .foregroundStyle(Color.risoInk)
                    .lineLimit(1)
                if seat.seatId == snapshot.game.hostSeatId { RisoBadge("Host", kind: .expiring) }
                if !bound.isEmpty {
                    Text(bound.map(\.display).joined(separator: " · "))
                        .font(.risoHead(11, .bold))
                        .tracking(1.32)
                        .textCase(.uppercase)
                        .foregroundStyle(Color.risoMuted)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 12)
            .frame(height: Self.chipHeight)
            .background(Capsule().fill(Color.risoPaper2))
            .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            // Clip to the capsule: short capsule strokes draw flat stubs at their ends.
            .clipShape(Capsule())
        }
        .accessibilityElement(children: .combine)
    }

    private func unboundChip(_ name: RosterName) -> some View {
        Text(name.display)
            .font(.risoHead(14, .bold))
            .foregroundStyle(Color.risoInk)
            .lineLimit(1)
            .padding(.horizontal, 12)
            .frame(height: Self.chipHeight)
            .background(Capsule().fill(Color.risoPaper))
            .overlay(Capsule().strokeBorder(Color.risoInk,
                                            style: StrokeStyle(lineWidth: Riso.Keyline.container, dash: [5, 4])))
            .clipShape(Capsule())
    }

    /// The chip as a button (one key), a menu (several) or static (no keys, or not the host).
    @ViewBuilder
    private func interactive<Label: View>(keys: [RosterName], @ViewBuilder label: () -> Label) -> some View {
        let chip = label().fixedSize()
        if let onOpen, let first = keys.first {
            if keys.count == 1 {
                Button { onOpen(first.key) } label: { chip.risoHitSlop(Self.hitSlop) }
                    .buttonStyle(.plain)
            } else {
                Menu {
                    ForEach(keys) { name in Button(name.display) { onOpen(name.key) } }
                } label: { chip.risoHitSlop(Self.hitSlop) }
                    .buttonStyle(.plain)
            }
        } else {
            chip
        }
    }
}
