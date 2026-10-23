import SwiftUI

/// A seated player's live game (web `GamePage`): switches on stage, or shows the listener
/// failure with Home.
struct GameView: View {
    @StateObject private var vm: GameViewModel
    let service: GameService
    let onHome: () -> Void

    init(service: GameService, gameId: String, seatId: String, onHome: @escaping () -> Void) {
        self.init(vm: GameViewModel(service: service, gameId: gameId, seatId: seatId), service: service, onHome: onHome)
    }

    /// Injects the view model (hosting tests).
    init(vm: @autoclosure @escaping () -> GameViewModel, service: GameService, onHome: @escaping () -> Void) {
        _vm = StateObject(wrappedValue: vm())
        self.service = service
        self.onHome = onHome
    }

    var body: some View {
        // The subscription hangs off this unary wrapper, not the stage branches below, so a
        // stage switch never restarts or stops it; `.task` cancels it when the screen goes away.
        ZStack { content }
            .task { await vm.run() }
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
                         banner: vm.banner, pendingCells: vm.pendingCells, slowCells: vm.slowCells,
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

/// App root: waits for the launch resume check, then routes between Home, Join and Game.
struct RootView: View {
    @ObservedObject var model: AppModel
    @State private var joinModel: JoinViewModel?

    var body: some View {
        Group {
            if !model.launched {
                RisoPage { MutedText("Loading") }
            } else {
                switch model.route {
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
        // Launch (and the resume route it sets) runs once here, before anything is shown.
        .task { if !model.launched { await model.launch() } }
        .onOpenURL { url in
            if let code = JoinCode.parse(url.absoluteString), url.path.contains("/g/") { openJoin(code: code) }
        }
    }

    private func openJoin(code: String) {
        let m = JoinViewModel(service: model.service, code: code)
        joinModel = m
        model.openJoin(code: code)
        _Concurrency.Task { await m.check() }
    }

    private func seat(code: String, gameId: String, seatId: String) {
        joinModel = nil
        model.seat(code: code, gameId: gameId, seatId: seatId)
    }

    private func goHome() {
        joinModel = nil
        model.goHome()
    }
}
