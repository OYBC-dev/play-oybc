import SwiftUI

/// Landing-page text input (web `Landing.module.css` `.input`): 52pt, 2pt ink keyline,
/// paper fill, Bricolage 700 17pt, the placeholder doubling as the accessibility label.
/// `.code` is the uppercase game-code style (Bricolage 800 20pt, +.22em).
/// `readOnly` draws the same box with the value as static text (the waiting state).
struct RisoInputField: View {
    enum Style {
        case name
        case code
    }

    let placeholder: String
    @Binding var text: String
    var maxLength: Int
    var style: Style = .name
    var readOnly = false
    var capitalization: TextInputAutocapitalization = .words
    var contentType: UITextContentType? = nil
    var onSubmit: () -> Void = {}

    var body: some View {
        Group {
            if readOnly {
                Text(text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel(placeholder)
                    .accessibilityValue(text)
            } else {
                TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(Color.risoMuted))
                    .accessibilityLabel(placeholder)
                    .textInputAutocapitalization(capitalization)
                    .autocorrectionDisabled()
                    .textContentType(contentType)
                    .submitLabel(.go)
                    .onSubmit(onSubmit)
                    .onChange(of: text) { _, v in if v.count > maxLength { text = String(v.prefix(maxLength)) } }
            }
        }
        .font(style == .code ? .risoHead(20, .extraBold) : .risoHead(17, .bold))
        .tracking(style == .code ? 4.4 : 0)
        .foregroundStyle(Color.risoInk)
        .tint(Color.risoInk)
        .padding(.horizontal, 14)
        .frame(height: 52)
        .background(RoundedRectangle(cornerRadius: Riso.cardRadius).fill(Color.risoPaper))
        .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
    }
}
