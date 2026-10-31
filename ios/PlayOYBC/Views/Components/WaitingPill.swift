import SwiftUI

/// A dashed waiting pill with three bouncing dots (1.2s loop, 0.2s stagger). Static at 60%
/// under Reduce Motion or when `animated` is false (snapshots).
///
/// - `.block`: the join flow's "Waiting for the host" (web Join `.waiting`) — 46pt, full
///   width, card radius, ink text.
/// - `.compact`: the lobby's "Waiting for players" (web Lobby `.waiting`) — a 38pt capsule
///   hugging its content, muted text.
///
/// - `.footer`: the lobby sheet's expanded player footer — 52pt, full width, card radius.
/// - `.mini`: the collapsed player sheet's "Waiting for host" under Copy link — 34pt, 11.5pt.
///
/// `tone` overrides the text colour: `.muted` (on the paper sheet), `.onColor` (on the olive ready
/// sheet), `.danger` ("Pool needs N more tasks"). `dots: false` drops the dots.
///
/// Announced once to VoiceOver when it appears (web `role="status"`).
struct WaitingPill: View {
    enum Style {
        case block
        case compact
        case footer
        case mini
    }

    enum Tone {
        case ink
        case muted
        case onColor
        case danger

        var color: Color {
            switch self {
            case .ink: return .risoInk
            case .muted: return .risoMuted
            case .onColor: return .risoOnColor
            case .danger: return .risoDanger
            }
        }
    }

    var title = "Waiting for the host"
    var style: Style = .block
    var animated = true
    /// Text (and dot) colour; nil = the style's own (ink for `.block`, muted otherwise).
    var tone: Tone? = nil
    var dots = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var foreground: Color { (tone ?? (style == .block ? .ink : .muted)).color }

    private var fontSize: CGFloat {
        switch style {
        case .block, .footer: return 15
        case .compact: return 14
        case .mini: return 11.5
        }
    }

    private var gap: CGFloat {
        switch style {
        case .block: return 10
        case .compact, .footer: return 8
        case .mini: return 6
        }
    }

    var body: some View {
        HStack(spacing: gap) {
            Text(title)
                .font(.risoHead(fontSize, .bold))
                .foregroundStyle(foreground)
                .lineLimit(1)
                .fixedSize()
            if dots { dotRow.accessibilityHidden(true) }
        }
        .modifier(PillShape(style: style))
        .accessibilityElement(children: .combine)
        .onAppear { AccessibilityNotification.Announcement(title).post() }
        .onChange(of: title) { _, t in AccessibilityNotification.Announcement(t).post() }
    }

    @ViewBuilder
    private var dotRow: some View {
        if animated && !reduceMotion {
            TimelineView(.animation) { ctx in
                dotRow(time: ctx.date.timeIntervalSinceReferenceDate)
            }
        } else {
            dotRow(time: nil)
        }
    }

    private func dotRow(time: TimeInterval?) -> some View {
        let size: CGFloat = style == .block || style == .footer ? 5 : 4
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
        case .footer:
            content
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Color.risoInk, style: dash))
        case .mini:
            content
                .padding(.horizontal, 10)
                .frame(height: 34)
                .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Color.risoInk, style: dash))
        }
    }
}
