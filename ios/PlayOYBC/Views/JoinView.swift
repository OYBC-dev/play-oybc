import SwiftUI

/// `/g/<CODE>` before seating (web `JoinPage`): Loading, name entry, waiting for the host's
/// reclaim decision, or a failure with Try again / Home. The seated phase is rendered by `RootView`.
struct JoinView: View {
    @ObservedObject var model: JoinViewModel
    let onHome: () -> Void
    /// Called once the phase reaches seated (resumed, joined or reclaim approved).
    var onSeated: (_ gameId: String, _ seatId: String) -> Void = { _, _ in }
    @State var name = ""
    /// False freezes the waiting dots (snapshots).
    var animateWaiting = true

    var body: some View {
        content
            .onAppear { if case let .seated(g, s) = model.phase { onSeated(g, s) } }
            .onChange(of: model.phase) { _, phase in
                if case let .seated(g, s) = phase { onSeated(g, s) }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .checking, .seated:
            RisoPage { MutedText("Loading") }
        case let .failed(message):
            RisoPage {
                ErrorText(message)
                RisoButton(title: "Try again", kind: .primary) { _Concurrency.Task { await model.check() } }
                RisoButton(title: "Home", kind: .ghost, action: onHome)
            }
        case .waiting:
            shell(waiting: true)
        case .name:
            shell(waiting: false)
        }
    }

    /// Header (mark, kicker, code) over the name card (web `JoinShell`).
    private func shell(waiting: Bool) -> some View {
        RisoPage(gutter: Riso.gutter, top: 36, bottom: 32, spacing: 28) {
            HStack(spacing: 14) {
                PlayBrandMark(size: .header)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Join").risoKicker()
                    Text(model.code)
                        .font(.risoHead(34, .extraBold))
                        .tracking(3.4)
                        .foregroundStyle(Color.risoInk)
                        .accessibilityAddTraits(.isHeader)
                }
                Spacer(minLength: 8)
                // iOS has no browser back: the way out of the join flow.
                RisoButton(title: "Home", kind: .ghost, action: onHome)
            }
            RisoCardBox {
                // The label names the field once: the field itself carries the VoiceOver name and
                // no placeholder, so neither the screen nor VoiceOver repeats "Your name".
                SectionLabel("Your name").accessibilityHidden(true)
                RisoInputField(placeholder: "", text: $name, maxLength: 20, readOnly: waiting,
                               contentType: .nickname, accessibilityName: "Your name") { submit() }
                if let error = model.error { ErrorText(error) }
                if model.denied { DeniedLine() }
                if waiting {
                    WaitingPill(animated: animateWaiting)
                } else {
                    RisoButton(title: "Join", kind: .blue, fullWidth: true, large: true) { submit() }
                        .risoDisabled(model.busy)
                }
            }
        }
    }

    private func submit() {
        guard !model.busy, case .name = model.phase else { return }
        _Concurrency.Task { await model.submit(name: name) }
    }
}
