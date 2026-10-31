import SwiftUI

/// Centered modal dialog over the scrim (web `play/Dialog`): a keylined card with a large hard
/// shadow, titled, at most 440pt wide. A scrim tap or the VoiceOver escape gesture closes it.
/// VoiceOver focus moves to the title on open; the caller hands it back to the trigger on close.
struct RisoDialog<Content: View>: View {
    let title: String
    /// A red kicker over the title (the task explainer's "Welcome, {name}"); nil = none.
    var kicker: String? = nil
    /// Title size: 24 by default, 26 for the task explainer.
    var titleSize: CGFloat = 24
    let onClose: () -> Void
    let content: Content

    @AccessibilityFocusState private var titleFocused: Bool

    init(title: String, kicker: String? = nil, titleSize: CGFloat = 24, onClose: @escaping () -> Void,
         @ViewBuilder content: () -> Content) {
        self.title = title
        self.kicker = kicker
        self.titleSize = titleSize
        self.onClose = onClose
        self.content = content()
    }

    var body: some View {
        ZStack {
            Color.risoScrim
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture(perform: onClose)
                .accessibilityHidden(true)
            // A list taller than the screen scrolls inside the card.
            ViewThatFits(in: .vertical) {
                stack
                ScrollView { stack }
            }
            .frame(maxWidth: 440)
            .risoCard()
            .risoHardShadow(Riso.Shadow.large)
            .padding(22)
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
            .accessibilityAction(.escape, onClose)
        }
        .onAppear {
            // Set after the first layout pass, or VoiceOver drops the request.
            DispatchQueue.main.async { titleFocused = true }
        }
    }

    private var stack: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                if let kicker { Text(kicker).risoKicker() }
                Text(title)
                    .font(.risoHead(titleSize, .extraBold))
                    .tracking(-0.02 * titleSize)
                    .foregroundStyle(Color.risoInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused($titleFocused)
            }
            content
        }
        // The kicker's dialog takes the explainer's 18pt top.
        .padding(.top, kicker == nil ? 16 : 18)
        .padding([.horizontal, .bottom], 16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
