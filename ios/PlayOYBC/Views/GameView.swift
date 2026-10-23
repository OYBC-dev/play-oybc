import SwiftUI

/// A seated player's live game (web `GamePage`): switches on stage, or shows the listener
/// failure with Home.
struct GameView: View {
    @StateObject private var vm: GameViewModel
    let service: GameService
    let onHome: () -> Void

    init(service: GameService, gameId: String, seatId: String, onHome: @escaping () -> Void) {
        _vm = StateObject(wrappedValue: GameViewModel(service: service, gameId: gameId, seatId: seatId))
        self.service = service
        self.onHome = onHome
    }

    var body: some View {
        content
            .onAppear { vm.start() }
            .onDisappear { vm.stop() }
    }

    @ViewBuilder private var content: some View {
        if let error = vm.streamError {
            GameErrorView(message: ErrorMessages.listenerMessage(for: error, wasSeated: vm.snapshot != nil), onHome: onHome)
        } else if let snap = vm.snapshot {
            switch snap.game.stage {
            case .lobby:
                LobbyView(service: service, snapshot: snap, gameId: vm.gameId)
            case .playing:
                PlayView(service: service, snapshot: snap, gameId: vm.gameId,
                         banner: vm.banner, pendingCells: vm.pendingCells,
                         toggleError: vm.error.map(ErrorMessages.message(for:)),
                         onToggle: { i in _Concurrency.Task { await vm.toggle(cell: i) } },
                         onDismissBanner: { vm.dismissBanner() })
            case .ended:
                EndedView(service: service, snapshot: snap, gameId: vm.gameId, onHome: onHome)
            }
        } else {
            RisoPage { MutedText("Loading") }
        }
    }
}

/// A game that can't be shown: the error and a way Home.
struct GameErrorView: View {
    let message: String
    let onHome: () -> Void

    var body: some View {
        RisoPage {
            ErrorText(message)
            RisoButton(title: "Home", small: true, action: onHome)
        }
    }
}

/// Where the app is: home, a join flow for a code, or seated in a game.
enum AppRoute: Equatable {
    case home
    case join(code: String)
    case game(code: String, gameId: String, seatId: String)
}

/// App root: waits for the launch resume check, then routes between Home, Join and Game.
struct RootView: View {
    @ObservedObject var model: AppModel
    @State private var route: AppRoute = .home
    @State private var joinModel: JoinViewModel?

    var body: some View {
        Group {
            if !model.launched {
                RisoPage { MutedText("Loading") }
            } else {
                switch route {
                case .home:
                    HomeView(service: model.service,
                             onHosted: { code, g, s in seat(code: code, gameId: g, seatId: s) },
                             onJoin: { openJoin(code: $0) })
                case let .join(code):
                    if let joinModel {
                        JoinView(model: joinModel, onHome: goHome,
                                 onSeated: { g, s in seat(code: code, gameId: g, seatId: s) })
                    }
                case let .game(_, g, s):
                    GameView(service: model.service, gameId: g, seatId: s, onHome: goHome).id("\(g):\(s)")
                }
            }
        }
        .onChange(of: model.launched) { _, launched in
            if launched, let r = model.resumed { route = .game(code: r.code, gameId: r.gameId, seatId: r.seatId) }
        }
        .onOpenURL { url in
            if let code = JoinCode.parse(url.absoluteString), url.path.contains("/g/") { openJoin(code: code) }
        }
    }

    private func openJoin(code: String) {
        let m = JoinViewModel(service: model.service, code: code)
        joinModel = m
        route = .join(code: code)
        _Concurrency.Task { await m.check() }
    }

    private func seat(code: String, gameId: String, seatId: String) {
        model.remember(code: code)
        joinModel = nil
        route = .game(code: code, gameId: gameId, seatId: seatId)
    }

    private func goHome() {
        model.forget()
        joinModel = nil
        route = .home
    }
}
