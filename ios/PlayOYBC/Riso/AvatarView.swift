import SwiftUI

/// 30pt initials circle (web `Avatar`); colours from `AvatarFor`.
struct AvatarView: View {
    let name: String
    /// Join-order index (drives the fill colour).
    let index: Int

    static let diameter: CGFloat = 30

    var body: some View {
        let a = AvatarFor.make(name: name, index: index)
        AvatarCircle(fill: a.fill) {
            Text(a.initial).foregroundStyle(a.foreground)
        }
        .accessibilityHidden(true)
    }
}

/// The shared 30pt keylined circle with a hard shadow — the avatar and the "+N" bubble.
struct AvatarCircle<Label: View>: View {
    let fill: Color
    @ViewBuilder let label: Label

    var body: some View {
        label
            .font(.risoHead(12, .extraBold))
            .lineLimit(1)
            .frame(width: AvatarView.diameter, height: AvatarView.diameter)
            .background(Circle().fill(fill))
            .overlay(Circle().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            .risoHardShadow(Riso.Shadow.small, in: Circle())
    }
}
