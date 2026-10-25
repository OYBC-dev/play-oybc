import SwiftUI

/// The join flow's "Waiting for the host" state (web `.waiting`): a 46pt dashed-ink pill
/// with three bouncing dots (1.2s loop, 0.2s stagger). Static at 60% under Reduce Motion
/// or when `animated` is false (snapshots).
struct WaitingPill: View {
    var animated = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 10) {
            Text("Waiting for the host")
                .font(.risoHead(15, .bold))
                .foregroundStyle(Color.risoInk)
            dots.accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 46)
        .overlay(
            RoundedRectangle(cornerRadius: Riso.cardRadius)
                .strokeBorder(Color.risoInk, style: StrokeStyle(lineWidth: Riso.Keyline.container, dash: [6, 4]))
        )
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
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
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { i in
                let p = time.map { Self.bounce(($0 - 0.2 * Double(i)).truncatingRemainder(dividingBy: 1.2) / 1.2) } ?? 0
                Circle()
                    .fill(Color.risoInk)
                    .frame(width: 5, height: 5)
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
