import SwiftUI

/// Landing screen (web `HomePage`): host a new game or join one by code or pasted link.
struct HomeView: View {
    let service: GameService
    /// Called after `createGame` succeeds; the host is seated immediately.
    let onHosted: (_ code: String, _ gameId: String, _ seatId: String) -> Void
    /// Called with a parsed game code.
    let onJoin: (_ code: String) -> Void

    @State var name = ""
    @State var code = ""
    @State var error: String?
    @State var busy = false

    var body: some View {
        RisoPage {
            HStack(spacing: 12) {
                BrandMarkView(size: 40)
                Text("Play OYBC").font(.risoHead(28, .extraBold)).foregroundStyle(Color.risoInk)
            }
            RisoCardBox {
                SectionLabel("Host")
                LabeledField(label: "Your name", text: $name, maxLength: 20, contentType: .nickname) { host() }
                if let error { ErrorText(error) }
                RisoButton(title: "Host a game", kind: .primary, fullWidth: true, large: true) { host() }
                    .risoDisabled(busy)
            }
            RisoCardBox {
                SectionLabel("Join")
                LabeledField(label: "Game code", text: $code, maxLength: 120, capitalization: .characters) { join() }
                RisoButton(title: "Join", kind: .blue, fullWidth: true, large: true) { join() }
                    .risoDisabled(JoinCode.parse(code) == nil)
            }
        }
    }

    private func host() {
        guard !busy else { return }
        busy = true
        error = nil
        _Concurrency.Task {
            do {
                let res = try await service.createGame(name: name)
                onHosted(res.code, res.gameId, res.seatId)
            } catch {
                self.error = ErrorMessages.message(for: error)
                busy = false
            }
        }
    }

    private func join() {
        if let c = JoinCode.parse(code) { onJoin(c) }
    }
}
