import SwiftUI

/// A scrolling Riso page (web `.page`): paper background, 16pt gutters, 16pt stack gap.
/// Home and Join pass the iOS large-title metrics (20pt gutter, their own top and gap).
struct RisoPage<Content: View>: View {
    var scrolls = true
    var gutter: CGFloat = 16
    var top: CGFloat = 24
    var bottom: CGFloat = 24
    var spacing: CGFloat = 16
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
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(.horizontal, gutter)
            .padding(.top, top)
            .padding(.bottom, bottom)
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

extension View {
    /// Disables a control and dims it so the disabled state is visible (Riso buttons have no
    /// built-in disabled look).
    func risoDisabled(_ disabled: Bool) -> some View {
        self.disabled(disabled).opacity(disabled ? 0.5 : 1)
    }
}
