import SwiftUI

/// Overlapping avatars with a "+N" overflow bubble (web `AvatarStack`); the whole stack is
/// one button that toggles the player list.
struct AvatarStack: View {
    /// Seats in join order.
    let seats: [Seat]
    /// Max avatars shown before the "+N" bubble.
    var max: Int = 4
    /// Whether the list this stack toggles is open (announced to VoiceOver).
    var expanded: Bool = false
    let onToggle: () -> Void

    private static let overlap: CGFloat = -8

    var body: some View {
        let shown = Array(seats.prefix(Swift.max(max, 0)))
        let extra = seats.count - shown.count
        Button(action: onToggle) {
            HStack(spacing: Self.overlap) {
                ForEach(Array(shown.enumerated()), id: \.offset) { i, seat in
                    AvatarView(name: seat.name, index: i)
                }
                if extra > 0 {
                    AvatarCircle(fill: .risoPaper2) {
                        Text("+\(extra)").foregroundStyle(Color.risoInk)
                    }
                }
            }
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(seats.count) \(seats.count == 1 ? "player" : "players")")
        .accessibilityValue(expanded ? "Expanded" : "Collapsed")
    }
}
