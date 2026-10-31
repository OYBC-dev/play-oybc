import SwiftUI

/// Every player as a 38pt pill in join order; the host's pill carries the Host badge (web
/// `PlayerList`); the viewer's own pill carries a muted "YOU" after the name. Pills size to the name (names cap at 20 characters on Join).
///
/// A roster name bound to a player sits as a small tag inside that player's pill, after the name;
/// every roster name nobody carries yet follows the pills as a dashed chip, in roster order. For
/// the host (`onOpen` set) each tag and dashed chip is a button that opens the bind sheet for that
/// name, with a 44pt hit area that does not move the layout; for a guest they are muted and static.
/// A dashed chip that leaves the roster (retired, or bound) collapses out over 180 ms (at once
/// under Reduce Motion).
struct PlayerListView: View {
    let snapshot: GameSnapshot
    /// Host only: opens the bind sheet for a roster key. Nil = the tags and chips are static.
    var onOpen: ((String) -> Void)?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let chipHeight: CGFloat = 38

    private var roster: [RosterName] { snapshot.roster }
    private var unbound: [RosterName] { LobbyLogic.unboundRosterNames(roster) }

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(LobbyLogic.seatsByJoin(snapshot.seats)) { seat in
                playerPill(seat, bound: roster.filter { $0.seatId == seat.seatId })
            }
            ForEach(unbound) { name in
                unboundChip(name).transition(.collapseWidth)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: unbound.map(\.key))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Players")
    }

    private func playerPill(_ seat: Seat, bound: [RosterName]) -> some View {
        HStack(spacing: 8) {
            Text(seat.name)
                .font(.risoHead(14, .bold))
                .foregroundStyle(Color.risoInk)
                .lineLimit(1)
            if seat.seatId == snapshot.mySeatId {
                Text("You")
                    .font(.risoHead(11, .bold))
                    .tracking(1.32)
                    .textCase(.uppercase)
                    .foregroundStyle(Color.risoMuted)
                    .lineLimit(1)
                    .accessibilityIdentifier("player-you")
            }
            if seat.seatId == snapshot.game.hostSeatId { RisoBadge("Host", kind: .expiring) }
            ForEach(bound) { name in tag(name) }
        }
        .padding(.horizontal, 12)
        .frame(height: Self.chipHeight)
        // Clip the pill's own drawing to the capsule (short capsule strokes draw flat stubs at
        // their ends) but not its content, so a tag's hit area can spill past the pill.
        .background(
            Capsule().fill(Color.risoPaper2)
                .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
                .clipShape(Capsule())
        )
        .fixedSize()
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func tag(_ name: RosterName) -> some View {
        if let onOpen {
            // 22pt tag + 11pt each side = a 44pt target, spilling over the pill without moving it.
            Button { onOpen(name.key) } label: { BoundNameTag(name: name.display).risoHitSlop(11) }
                .buttonStyle(.plain)
                .accessibilityLabel(name.display)
                .accessibilityIdentifier("roster-tag-\(name.key)")
        } else {
            BoundNameTag(name: name.display, muted: true)
        }
    }

    @ViewBuilder
    private func unboundChip(_ name: RosterName) -> some View {
        if let onOpen {
            // 38pt chip + 3pt each side = a 44pt target.
            Button { onOpen(name.key) } label: { UnboundNameChip(name: name.display).risoHitSlop(3) }
                .buttonStyle(.plain)
                .accessibilityLabel("\(name.display), nobody yet")
                .accessibilityIdentifier("roster-chip-\(name.key)")
        } else {
            UnboundNameChip(name: name.display, muted: true)
                .accessibilityLabel("\(name.display), nobody yet")
        }
    }
}
