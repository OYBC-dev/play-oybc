import SwiftUI

/// "OYBC" wordmark with the rotated "Play" stamp on its top-right corner (web `Wordmark`).
/// Home only.
struct Wordmark: View {
    private static let wordSize: CGFloat = 92

    var body: some View {
        Text("OYBC")
            .font(.risoHead(Self.wordSize, .extraBold))
            .tracking(-0.045 * Self.wordSize)
            .foregroundStyle(Color.risoInk)
            .fixedSize()
            // CSS line-height .85: the box is 85% of the font size, glyphs centred in it.
            .frame(height: Self.wordSize * 0.85)
            .overlay(alignment: .topTrailing) {
                stamp
                    .rotationEffect(.degrees(9))
                    // CSS right: −20px / top: −22px relative to the word's box.
                    .offset(x: 20, y: -22)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Play OYBC")
            .accessibilityAddTraits(.isHeader)
    }

    private var stamp: some View {
        Text("Play")
            .font(.risoHead(21, .extraBold))
            .foregroundStyle(Color.risoOnColor)
            .fixedSize()
            .padding(.vertical, 3)
            .padding(.horizontal, 13)
            .background(Capsule().fill(Color.risoRed))
            .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            // Clip to the capsule: the stroke otherwise draws flat stubs past the curve
            // at the mid-height of short capsules.
            .clipShape(Capsule())
            .risoHardShadow(Riso.Shadow.small, in: Capsule())
    }
}
