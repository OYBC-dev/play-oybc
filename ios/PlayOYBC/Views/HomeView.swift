import SwiftUI

/// Landing screen (web `HomePage`): host a new game or join one by code or pasted link. "Host a game"
/// validates the name, then opens Game settings in place; its Back returns here with the name kept.
struct HomeView: View {
    let service: GameService
    /// Called after Game settings' `createGame` succeeds; the host is seated immediately.
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
    /// Game settings, kept across Back so Host again reopens them as they were.
    @State var settings: GameSettingsModel?
    @State var settingsShown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if settingsShown, let settings {
                GameSettingsView(model: settings, onBack: { show(false) },
                                 onCreated: { onHosted($0.code, $0.gameId, $0.seatId) })
                    .transition(.move(edge: .trailing))
            } else {
                home.transition(.move(edge: .leading))
            }
        }
    }

    private var home: some View {
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
        switch GameSettingsModel.open(rawName: name, reusing: settings, service: service) {
        case let .success(model):
            error = nil
            settings = model
            show(true)
        case let .failure(e):
            error = e.message
        }
    }

    private func show(_ shown: Bool) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { settingsShown = shown }
    }

    private func join() {
        if let c = JoinCode.parse(code) { onJoin(c) }
    }
}
