import SwiftUI

/// The "<Name> got a bingo!" banner (web `BingoBanner`); tap to dismiss.
struct BingoBannerView: View {
    let bingo: BingoDoc?
    let onDismiss: () -> Void

    var body: some View {
        if let bingo {
            Button(action: onDismiss) {
                HStack(spacing: 10) {
                    Text("★").foregroundStyle(Color.risoRed)
                    Text("\(bingo.name) got a bingo!").foregroundStyle(Color.risoInkStatic)
                        .multilineTextAlignment(.center)
                    Text("★").foregroundStyle(Color.risoRed)
                }
                .font(.risoHead(20, .extraBold))
                .tracking(-0.2)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .frame(maxWidth: 440, minHeight: 44)
                .frame(maxWidth: .infinity)
                .risoCard(fill: .risoGold)
            }
            .buttonStyle(RisoButtonStyle(offset: Riso.Shadow.card))
            .accessibilityLabel("\(bingo.name) got a bingo!")
            .padding(.horizontal, 16)
            .transition(.move(edge: .top).combined(with: .opacity))
            .id(bingo.seq)
        }
    }
}
