import SwiftUI

/// A scrolling Riso page (web `.page`): paper background, 16pt gutters, 16pt stack gap.
struct RisoPage<Content: View>: View {
    var scrolls = true
    @ViewBuilder let content: Content

    var body: some View {
        ZStack {
            RisoPaperBackground()
            if scrolls {
                ScrollView { stack }.scrollDismissesKeyboard(.interactively)
            } else {
                stack
            }
        }
    }

    private var stack: some View {
        VStack(alignment: .leading, spacing: 16) { content }
            .padding(.horizontal, 16)
            .padding(.vertical, 24)
            .frame(maxWidth: 480, alignment: .leading)
            .frame(maxWidth: .infinity)
    }
}

/// Inline error / validation copy (web `.error`).
struct ErrorText: View {
    let message: String
    init(_ message: String) { self.message = message }

    var body: some View {
        Text(message)
            .font(.risoBody(15, .semibold))
            .foregroundStyle(Color.risoRed)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isStaticText)
    }
}

/// Secondary one-line state copy (web `.muted`): loading, empty states.
struct MutedText: View {
    let message: String
    init(_ message: String) { self.message = message }

    var body: some View {
        Text(message).font(.risoBody(15)).foregroundStyle(Color.risoMuted)
    }
}

/// Card surface used for grouped content (web `RisoCard`).
struct RisoCardBox<Content: View>: View {
    var alignment: HorizontalAlignment = .leading
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: alignment, spacing: 12) { content }
            .padding(Riso.cardPadding)
            .frame(maxWidth: .infinity, alignment: Alignment(horizontal: alignment, vertical: .center))
            .risoCard()
            .risoHardShadow(Riso.Shadow.card)
    }
}

/// A labelled text input (web `.field`).
struct LabeledField: View {
    let label: String
    @Binding var text: String
    var maxLength: Int
    var capitalization: TextInputAutocapitalization = .words
    var contentType: UITextContentType? = nil
    var onSubmit: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.risoBody(15, .semibold)).foregroundStyle(Color.risoInk)
            TextField("", text: $text)
                .accessibilityLabel(label)
                .textInputAutocapitalization(capitalization)
                .autocorrectionDisabled()
                .textContentType(contentType)
                .submitLabel(.go)
                .onSubmit(onSubmit)
                .font(.risoBody(16, .medium))
                .foregroundStyle(Color.risoInk)
                .tint(Color.risoBlue)
                .padding(.horizontal, 12)
                .frame(minHeight: 48)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.risoPaper2))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
                .onChange(of: text) { _, v in if v.count > maxLength { text = String(v.prefix(maxLength)) } }
        }
    }
}

/// Section label (web `RisoSectionLabel`).
struct SectionLabel: View {
    let title: String
    init(_ title: String) { self.title = title }
    var body: some View { Text(title).risoSectionLabel().accessibilityAddTraits(.isHeader) }
}

/// Bottom-sheet body with a title and Close (web `play/Sheet`). Present inside `.sheet`.
struct RisoSheet<Content: View>: View {
    let title: String
    let onClose: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        ZStack {
            RisoPaperBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text(title).risoH2().accessibilityAddTraits(.isHeader)
                        Spacer()
                        RisoButton(title: "Close", small: true, action: onClose)
                    }
                    content
                }
                .padding(20)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

/// The OYBC 3×3 brand mark (web `RisoBrandMark`): red tile, cream dots, gold center.
struct BrandMarkView: View {
    var size: CGFloat = 40
    private let pattern = [1, 0, 1, 0, 2, 0, 1, 0, 1]

    var body: some View {
        let cell = (size - 10 - 4 - 4) / 3
        VStack(spacing: 2) {
            ForEach(0..<3, id: \.self) { r in
                HStack(spacing: 2) {
                    ForEach(0..<3, id: \.self) { c in
                        let v = pattern[r * 3 + c]
                        RoundedRectangle(cornerRadius: 1)
                            .fill(v == 2 ? Color.risoGold : (v == 1 ? Color.risoOnColor : Color.risoOnColor.opacity(0.32)))
                            .frame(width: cell, height: cell)
                    }
                }
            }
        }
        .padding(5)
        .frame(width: size, height: size)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.risoRed))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.risoInk, lineWidth: 2))
        .risoHardShadow(2, radius: 8)
        .accessibilityElement()
        .accessibilityLabel("OYBC")
    }
}

extension View {
    /// Disables a control and dims it so the disabled state is visible (Riso buttons have no
    /// built-in disabled look).
    func risoDisabled(_ disabled: Bool) -> some View {
        self.disabled(disabled).opacity(disabled ? 0.5 : 1)
    }
}
