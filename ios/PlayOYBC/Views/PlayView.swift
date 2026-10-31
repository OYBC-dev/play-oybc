import SwiftUI

/// The live game (web `PlayScreen`): the code pill + Leaderboard + game dots menu header,
/// your board, bingo banners and the leaderboard sheet.
struct PlayView: View {
    let service: GameService
    let snapshot: GameSnapshot
    let gameId: String
    var banners: [BingoDoc] = []
    /// False in snapshots: no confetti or banner motion.
    var bannerMotion = true
    var pendingCells: Set<Int> = []
    var slowCells: Set<Int> = []
    var toggleError: String?
    var onToggle: (Int) -> Void = { _ in }
    var onDismissBanner: () -> Void = {}
    /// "Leave game" from the menu: forget the game on this device and go Home.
    var onLeave: () -> Void = {}

    @State var leaderboard = false
    /// What the host menu has open (snapshots start it open).
    @State var hostMenu: HostMenuStage?
    @AccessibilityFocusState private var dotsFocused: Bool

    private var isHost: Bool { snapshot.game.hostSeatId == snapshot.mySeatId }
    private var menuModel: HostMenuModel { HostMenuModel(snapshot: snapshot, canEnd: true) }

    var body: some View {
        ZStack(alignment: .top) {
            RisoPage(gutter: Riso.gutter, top: 10, spacing: 14) {
                BoardHeaderView(code: snapshot.game.code, showsMenu: menuModel.showsButton, menuOpen: hostMenu == .menu,
                                menuFocus: $dotsFocused,
                                onLeaderboard: { leaderboard = true },
                                onMenu: { hostMenu = hostMenu == .menu ? nil : .menu })
                if let board = snapshot.board {
                    BoardGridView(board: board, pending: pendingCells, slow: slowCells, error: toggleError, onToggle: onToggle)
                } else {
                    MutedText("Loading")
                }
            }
            // Web places the stack at top: 56 — just under the header — so the code pill,
            // Leaderboard and dots stay reachable (the stack passes taps through gaps).
            BingoBannerView(banners: banners, animates: bannerMotion, onDismiss: onDismissBanner)
        }
        .hostMenu(stage: $hostMenu, model: menuModel, service: service, gameId: gameId, triggerFocus: $dotsFocused,
                  onLeave: onLeave)
        .accessibilityIdentifier("stage-playing")
        .sheet(isPresented: $leaderboard) {
            RisoSheet(title: "Leaderboard", onClose: { leaderboard = false }) {
                LeaderboardView(standings: snapshot.standings)
            }
        }
    }
}

/// The board header (README §5): the game-code pill on the left; "Leaderboard" and the game
/// dots button on the right. At large text sizes the actions wrap under the pill.
struct BoardHeaderView: View {
    let code: String
    let showsMenu: Bool
    var menuOpen = false
    var menuFocus: AccessibilityFocusState<Bool>.Binding
    let onLeaderboard: () -> Void
    let onMenu: () -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                pill
                Spacer(minLength: 0)
                actions
            }
            VStack(alignment: .leading, spacing: 10) {
                pill
                actions
            }
        }
        .frame(minHeight: 44)
    }

    /// 36pt paper-2 capsule, 2pt keyline, Bricolage 800 14 at .14em.
    private var pill: some View {
        Text(code)
            .font(.risoHead(14, .extraBold))
            .tracking(1.96)
            .foregroundStyle(Color.risoInk)
            .lineLimit(1)
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background(Capsule().fill(Color.risoPaper2))
            .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            // Clip to the capsule: short capsule strokes draw flat stubs at their ends.
            .clipShape(Capsule())
            .fixedSize()
            .accessibilityIdentifier("game-code")
    }

    private var actions: some View {
        HStack(spacing: 8) {
            RisoButton(title: "Leaderboard", small: true, action: onLeaderboard)
                .risoHitSlop(6)
            if showsMenu {
                HostMenuButton(open: menuOpen, focus: menuFocus, action: onMenu)
            }
        }
        .fixedSize()
    }
}
