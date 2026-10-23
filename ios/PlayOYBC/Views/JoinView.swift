import SwiftUI

/// `/g/<CODE>` before seating (web `JoinPage`): Loading, name entry, waiting for the host's
/// reclaim decision, or a failure with Home. The seated phase is rendered by `RootView`.
struct JoinView: View {
    @ObservedObject var model: JoinViewModel
    let onHome: () -> Void
    /// Called once the phase reaches seated (resumed, joined or reclaim approved).
    var onSeated: (_ gameId: String, _ seatId: String) -> Void = { _, _ in }
    @State var name = ""

    var body: some View {
        RisoPage {
            switch model.phase {
            case .checking, .seated:
                MutedText("Loading")
            case .waiting:
                homeButton
                RisoCardBox { Text("Waiting for the host").font(.risoBody(16, .semibold)).foregroundStyle(Color.risoInk) }
            case let .failed(message):
                ErrorText(message)
                homeButton
            case .name:
                homeButton
                RisoCardBox {
                    SectionLabel(model.code)
                    LabeledField(label: "Your name", text: $name, maxLength: 20, contentType: .nickname) { submit() }
                    if let error = model.error { ErrorText(error) }
                    RisoButton(title: "Join", kind: .primary, fullWidth: true, large: true) { submit() }
                        .risoDisabled(model.busy)
                }
            }
        }
        .onAppear { if case let .seated(g, s) = model.phase { onSeated(g, s) } }
        .onChange(of: model.phase) { _, phase in
            if case let .seated(g, s) = phase { onSeated(g, s) }
        }
    }

    private var homeButton: some View {
        RisoButton(title: "Home", small: true, action: onHome)
    }

    private func submit() {
        guard !model.busy else { return }
        _Concurrency.Task { await model.submit(name: name) }
    }
}
