import SwiftUI

/// The pre-game lobby, pool first (web `LobbyScreen`): "Pool" title + count and the avatar
/// stack (toggles the player chips), the composer, the live pool, and the bottom sheet with
/// the code, shortfalls, share and Launch.
///
/// The sheet ignores the keyboard, so with the keyboard up it stays behind it and the
/// composer keeps the visible area.
struct LobbyView: View {
    let service: GameService
    let snapshot: GameSnapshot
    let gameId: String
    /// "Leave game" from the menu: forget the game on this device and go Home.
    var onLeave: () -> Void = {}
    @State var deleting: Set<String> = []
    @State var deleteError: String?
    @State var playersOpen = false
    /// Sheet height above the home-indicator safe area, for the scroll padding under it.
    @State private var sheetHeight: CGFloat = 150
    /// False freezes the waiting dots (snapshots).
    var animateWaiting = true
    /// What the host menu has open (snapshots start it open).
    @State var hostMenu: HostMenuStage?
    @AccessibilityFocusState private var dotsFocused: Bool

    private var isHost: Bool { snapshot.game.hostSeatId == snapshot.mySeatId }
    private var seats: [Seat] { LobbyLogic.seatsByJoin(snapshot.seats) }
    private var menuModel: HostMenuModel { HostMenuModel(snapshot: snapshot, canEnd: true) }

    var body: some View {
        ZStack {
            RisoPaperBackground()
            ScrollView { content }.scrollDismissesKeyboard(.interactively)
        }
        .overlay { sheet }
        .hostMenu(stage: $hostMenu, model: menuModel, service: service, gameId: gameId, triggerFocus: $dotsFocused,
                  onLeave: onLeave)
        .accessibilityIdentifier("stage-lobby")
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            if playersOpen { PlayerListView(snapshot: snapshot) }
            if seats.count <= 1 {
                WaitingPill(title: "Waiting for players", style: .compact, animated: animateWaiting)
            }
            AddTaskView(service: service, gameId: gameId,
                        seatNames: seats.filter { $0.seatId != snapshot.mySeatId }.map(\.name))
                .zIndex(1)
            if let deleteError { ErrorText(deleteError) }
            PoolListView(entries: snapshot.view, isHost: isHost, deleting: deleting) { remove($0) }
        }
        .padding(.horizontal, Riso.gutter)
        .padding(.top, 10)
        .padding(.bottom, sheetHeight + 16)
        .frame(maxWidth: 480, alignment: .leading)
        .frame(maxWidth: .infinity)
    }

    private var header: some View {
        LobbyHeaderView(poolCount: snapshot.view.count, seats: seats, playersOpen: playersOpen,
                        showsMenu: menuModel.showsButton, menuOpen: hostMenu == .menu, menuFocus: $dotsFocused,
                        onTogglePlayers: { playersOpen.toggle() },
                        onMenu: { hostMenu = hostMenu == .menu ? nil : .menu })
    }

    /// The bottom sheet, pinned to the screen's bottom edge and clear of the keyboard.
    private var sheet: some View {
        GeometryReader { geo in
            let inset = geo.safeAreaInsets.bottom
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                LobbySheetView(snapshot: snapshot, isHost: isHost, bottomInset: inset) {
                    try await service.launch(gameId: gameId)
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { sheetHeight = max(0, $0 - inset) }
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .ignoresSafeArea(.keyboard)
    }

    private func remove(_ id: String) {
        deleteError = nil
        deleting.insert(id)
        _Concurrency.Task {
            do { try await service.deleteTask(gameId: gameId, taskId: id) }
            catch { deleteError = ErrorMessages.message(for: error) }
            deleting.remove(id)
        }
    }
}

/// The lobby header (README §3): large "Pool" title with the "{n} / 24" count; the avatar stack
/// and the game dots menu on the right. At large text
/// sizes the avatars and menu wrap under the title.
struct LobbyHeaderView: View {
    let poolCount: Int
    /// Seats in join order.
    let seats: [Seat]
    let playersOpen: Bool
    let showsMenu: Bool
    var menuOpen = false
    var menuFocus: AccessibilityFocusState<Bool>.Binding
    let onTogglePlayers: () -> Void
    let onMenu: () -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 10) {
                title
                Spacer(minLength: 0)
                actions
            }
            VStack(alignment: .leading, spacing: 8) {
                title
                actions
            }
        }
        .frame(minHeight: 44)
    }

    private var title: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("Pool")
                .font(.risoHead(34, .extraBold))
                .tracking(-0.85)
                .foregroundStyle(Color.risoInk)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Text("\(poolCount) / \(GameConstants.minPoolSize)")
                .font(.risoHead(17, .extraBold))
                .foregroundStyle(Color.risoMuted)
                .lineLimit(1)
        }
        .fixedSize()
    }

    private var actions: some View {
        HStack(spacing: 10) {
            AvatarStack(seats: seats, max: 5, expanded: playersOpen, onToggle: onTogglePlayers)
                .padding(.trailing, 6)
            if showsMenu {
                HostMenuButton(open: menuOpen, focus: menuFocus, action: onMenu)
            }
        }
        .fixedSize()
    }
}
