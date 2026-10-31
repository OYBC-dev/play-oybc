import SwiftUI

/// Initials circle (web `Avatar`), 30pt by default; colours from `AvatarFor`.
struct AvatarView: View {
    let name: String
    /// Join-order index (drives the fill colour).
    let index: Int
    /// 32 in the lobby sheet's player rows.
    var diameter: CGFloat = AvatarView.diameter

    static let diameter: CGFloat = 30

    var body: some View {
        let a = AvatarFor.make(name: name, index: index)
        AvatarCircle(fill: a.fill, diameter: diameter) {
            Text(a.initial).foregroundStyle(a.foreground)
        }
        .accessibilityHidden(true)
    }
}

/// The shared keylined circle with a hard shadow — the avatar and the "+N" bubble. The initial is
/// Bricolage 800 at 12pt on the 30pt circle, 13pt on larger ones.
struct AvatarCircle<Label: View>: View {
    let fill: Color
    var diameter: CGFloat = AvatarView.diameter
    @ViewBuilder let label: Label

    var body: some View {
        label
            .font(.risoHead(diameter > AvatarView.diameter ? 13 : 12, .extraBold))
            .lineLimit(1)
            .frame(width: diameter, height: diameter)
            .background(Circle().fill(fill))
            .overlay(Circle().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            .risoHardShadow(Riso.Shadow.small, in: Circle())
    }
}
