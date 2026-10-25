import SwiftUI

/// A dashed waiting pill with three bouncing dots (1.2s loop, 0.2s stagger). Static at 60%
/// under Reduce Motion or when `animated` is false (snapshots).
///
/// - `.block`: the join flow's "Waiting for the host" (web Join `.waiting`) — 46pt, full
///   width, card radius, ink text.
/// - `.compact`: the lobby's "Waiting for players" (web Lobby `.waiting`) — a 38pt capsule
///   hugging its content, muted text.
///
/// Announced once to VoiceOver when it appears (web `role="status"`).
struct WaitingPill: View {
    enum Style {
        case block
        case compact
    }

    var title = "Waiting for the host"
    var style: Style = .block
    var animated = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var foreground: Color { style == .block ? .risoInk : .risoMuted }

    var body: some View {
        HStack(spacing: style == .block ? 10 : 8) {
            Text(title)
                .font(.risoHead(style == .block ? 15 : 14, .bold))
                .foregroundStyle(foreground)
                .lineLimit(1)
                .fixedSize()
            dots.accessibilityHidden(true)
        }
        .modifier(PillShape(style: style))
        .accessibilityElement(children: .combine)
        .onAppear { AccessibilityNotification.Announcement(title).post() }
    }

    @ViewBuilder
    private var dots: some View {
        if animated && !reduceMotion {
            TimelineView(.animation) { ctx in
                dotRow(time: ctx.date.timeIntervalSinceReferenceDate)
            }
        } else {
            dotRow(time: nil)
        }
    }

    private func dotRow(time: TimeInterval?) -> some View {
        let size: CGFloat = style == .block ? 5 : 4
        return HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { i in
                let p = time.map { Self.bounce(($0 - 0.2 * Double(i)).truncatingRemainder(dividingBy: 1.2) / 1.2) } ?? 0
                Circle()
                    .fill(foreground)
                    .frame(width: size, height: size)
                    .opacity(time == nil ? 0.6 : 0.25 + 0.75 * p)
                    .offset(y: -3 * p)
            }
        }
    }

    /// Keyframes `0%, 80%, 100%` → 0, `40%` → 1, linear between.
    private static func bounce(_ phase: Double) -> Double {
        let t = phase < 0 ? phase + 1 : phase
        if t < 0.4 { return t / 0.4 }
        if t < 0.8 { return (0.8 - t) / 0.4 }
        return 0
    }
}

/// The pill's frame and dashed ink keyline per style.
private struct PillShape: ViewModifier {
    let style: WaitingPill.Style
    private let dash = StrokeStyle(lineWidth: Riso.Keyline.container, dash: [6, 4])

    func body(content: Content) -> some View {
        switch style {
        case .block:
            content
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Color.risoInk, style: dash))
        case .compact:
            content
                .padding(.horizontal, 14)
                .frame(height: 38)
                .overlay(Capsule().strokeBorder(Color.risoInk, style: dash))
                // Clip to the capsule: short capsule strokes draw flat stubs at their ends.
                .clipShape(Capsule())
        }
    }
}
