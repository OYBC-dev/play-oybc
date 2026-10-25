import SwiftUI

/// Landing screen (web `HomePage`): host a new game or join one by code or pasted link.
struct HomeView: View {
    let service: GameService
    /// Called after `createGame` succeeds; the host is seated immediately.
    let onHosted: (_ code: String, _ gameId: String, _ seatId: String) -> Void
    /// Called with a parsed game code.
    let onJoin: (_ code: String) -> Void
    /// The saved game whose launch check failed transiently, if any.
    var resume: ResumePrompt? = nil
    /// Checks the saved game again.
    var onResume: () -> Void = {}

    @State var name = ""
    @State var code = ""
    @State var error: String?
    @State var busy = false

    var body: some View {
        RisoPage(gutter: Riso.gutter, top: 40, bottom: 32, spacing: 26) {
            hero
            if let resume {
                RisoCardBox {
                    SectionLabel("Your game · \(resume.code)")
                    if let error = resume.error { ErrorText(error) }
                    RisoButton(title: "Resume game", kind: .primary, fullWidth: true, large: true) { onResume() }
                        .risoDisabled(resume.busy)
                }
            }
            RisoCardBox {
                SectionLabel("Host a game")
                RisoInputField(placeholder: "Your name", text: $name, maxLength: 20, contentType: .nickname) { host() }
                if let error { ErrorText(error) }
                RisoButton(title: "Host a game", kind: .primary, fullWidth: true, large: true) { host() }
                    .risoDisabled(busy)
            }
            RisoCardBox {
                SectionLabel("Join")
                // 120, not 5: a pasted game link is parsed down to its code.
                RisoInputField(placeholder: "Game code", text: $code, maxLength: 120, style: .code,
                               capitalization: .characters) { join() }
                RisoButton(title: "Join", kind: .blue, fullWidth: true, large: true) { join() }
                    .risoDisabled(JoinCode.parse(code) == nil)
            }
        }
    }

    /// Brand mark over the wordmark, centred (web `.hero`).
    private var hero: some View {
        VStack(spacing: 18) {
            // Decorative here: the wordmark beside it names the app.
            PlayBrandMark(size: .home).accessibilityHidden(true)
            Wordmark()
        }
        .padding(.top, 16)
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity)
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
