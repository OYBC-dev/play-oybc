import SwiftUI

/// Mini bingo-board motif for empty states (web `RisoMiniBoardArt`): a framed 3×3 grid of
/// keylined cells with an ink-static FREE centre carrying a gold star. Decorative.
///
/// Static on iOS — the web pop-in entrance is not mirrored, so snapshots stay
/// deterministic and there is nothing to gate for Reduce Motion.
struct RisoMiniBoardArt: View {
    /// Per-cell size; defaults to the handoff's 26pt.
    var cellSize: CGFloat = 26

    private let gap: CGFloat = 5

    var body: some View {
        VStack(spacing: gap) {
            ForEach(0..<3, id: \.self) { r in
                HStack(spacing: gap) {
                    ForEach(0..<3, id: \.self) { c in cell(free: r == 1 && c == 1) }
                }
            }
        }
        .padding(6)
        .background(RoundedRectangle(cornerRadius: Riso.cardRadius).fill(Color.risoPaper2))
        .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
        .risoHardShadow(Riso.Shadow.button)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func cell(free: Bool) -> some View {
        if free {
            // Ink-static, never adaptive ink: adaptive flips to cream in dark and swallows the star.
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.risoInkStatic)
                .frame(width: cellSize, height: cellSize)
                .overlay(
                    Image(systemName: "star.fill")
                        .font(.system(size: cellSize * 0.5, weight: .bold))
                        .foregroundStyle(Color.risoGold)
                )
        } else {
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.risoPaper2)
                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.risoInk, lineWidth: 1.5))
                .frame(width: cellSize, height: cellSize)
        }
    }
}
