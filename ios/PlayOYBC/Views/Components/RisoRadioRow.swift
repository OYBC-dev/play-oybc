import SwiftUI

/// One row of a radio group (web `Dialog` / bind-sheet radios): a 22pt ring with a 2pt ink
/// keyline — checked fills it blue with a 10pt on-colour dot — then the label in Bricolage 16/700,
/// 46pt tall with a 1pt hair divider on top. The whole row is the button.
struct RisoRadioRow: View {
    let label: String
    let checked: Bool
    /// Label colour (the bind sheet's "Nobody yet" is muted).
    var labelColor: Color = .risoInk
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(checked ? Color.risoBlue : .clear)
                    Circle().strokeBorder(Color.risoInk, lineWidth: 2)
                    if checked { Circle().fill(Color.risoOnColor).frame(width: 10, height: 10) }
                }
                .frame(width: 22, height: 22)
                Text(label)
                    .font(.risoHead(16, .bold))
                    .foregroundStyle(labelColor)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .frame(minHeight: 46)
            .overlay(alignment: .top) { Rectangle().fill(Color.risoHair).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(checked ? [.isSelected] : [])
    }
}
