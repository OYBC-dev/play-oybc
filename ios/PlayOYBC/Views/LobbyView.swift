import SwiftUI

/// The pre-game lobby, pool first (web `LobbyScreen`): "Pool" title + count and the avatar
/// stack (toggles the player chips), the composer, the live pool, and the bottom sheet with
/// the code, shortfalls, share and Launch (expandable to the readiness summary, players and QR).
/// "How tasks work" opens on this device's first lobby and from the composer's (i) bubble.
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
    /// Host: the roster key whose bind sheet is open.
    @State var bindingKey: String?
    @AccessibilityFocusState private var dotsFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Launch, and its "Launch?" confirm while unbound roster names remain.
    @StateObject private var launchModel = LaunchModel()
    /// The bottom sheet's resting height (snapshots start it expanded).
    @State var sheetExpanded = false
    /// The task explainer, while open.
    @State var howTo: HowTasksWork.Entry?
    /// Where `oybc.howto.seen` lives (the explainer's first-lobby gate).
    var howToDefaults: UserDefaults = .standard
    /// Bumped to focus the composer (after the first-lobby explainer) or VoiceOver-focus its (i) bubble.
    @State private var composerFocus = 0
    @State private var infoFocus = 0

    private var isHost: Bool { snapshot.game.hostSeatId == snapshot.mySeatId }
    private var seats: [Seat] { LobbyLogic.seatsByJoin(snapshot.seats) }
    private var menuModel: HostMenuModel { HostMenuModel(snapshot: snapshot, canEnd: true) }

    var body: some View {
        ZStack {
            RisoPaperBackground()
            ScrollView { content }.scrollDismissesKeyboard(.interactively)
        }
        .overlay { sheet }
        .overlay { howToDialog }
        .overlay { launchConfirm }
        .hostMenu(stage: $hostMenu, model: menuModel, service: service, gameId: gameId, triggerFocus: $dotsFocused,
                  onLeave: onLeave, onRoster: { playersOpen = true })
        .accessibilityIdentifier("stage-lobby")
        .sheet(isPresented: bindSheetShown) { bindSheet }
        .onAppear(perform: autoOpenHowTo)
    }

    /// Opens the explainer on this device's first lobby, unless this seat already wrote tasks.
    private func autoOpenHowTo() {
        guard howTo == nil, HowTasksWork.shouldAutoOpen(seen: HowTasksWork.hasSeen(howToDefaults), stage: snapshot.game.stage,
                                                        entries: snapshot.view) else { return }
        howTo = .firstJoin(name: seats.first { $0.seatId == snapshot.mySeatId }?.name ?? "")
    }

    @ViewBuilder
    private var howToDialog: some View {
        if let entry = howTo {
            HowTasksWorkView(entry: entry) { closeHowTo(entry) }
        }
    }

    /// Marks the explainer seen; focus goes to the composer after the first-lobby one, else back to the bubble.
    private func closeHowTo(_ entry: HowTasksWork.Entry) {
        HowTasksWork.markSeen(howToDefaults)
        howTo = nil
        if case .firstJoin = entry { composerFocus += 1 } else { infoFocus += 1 }
    }

    /// The roster name the bind sheet is for, while the host has one open and it is still listed.
    private var boundName: RosterName? {
        guard isHost, let bindingKey else { return nil }
        return snapshot.roster.first { $0.key == bindingKey }
    }

    /// Open while `boundName` resolves; a retired / vanished name or a lost host closes it.
    private var bindSheetShown: Binding<Bool> {
        Binding(get: { boundName != nil }, set: { if !$0 { bindingKey = nil } })
    }

    @ViewBuilder
    private var bindSheet: some View {
        if let name = boundName {
            BindNameSheetView(name: name, seats: seats, service: service, gameId: gameId) { bindingKey = nil }
                .id(name.key)
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            if playersOpen { PlayerListView(snapshot: snapshot, onOpen: isHost ? { bindingKey = $0 } : nil) }
            if seats.count <= 1 {
                WaitingPill(title: "Waiting for players", style: .compact, animated: animateWaiting)
            }
            AddTaskView(service: service, gameId: gameId,
                        seatNames: seats.filter { $0.seatId != snapshot.mySeatId }.map(\.name),
                        roster: snapshot.roster,
                        selfName: seats.first { $0.seatId == snapshot.mySeatId }?.name,
                        seats: seats, selfSeatId: snapshot.mySeatId,
                        onInfo: { howTo = .info }, focusRequest: composerFocus, infoFocusRequest: infoFocus)
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
        LobbyHeaderView(count: LobbyLogic.poolCount(game: snapshot.game, mySeatId: snapshot.mySeatId),
                        gameName: snapshot.game.gameName,
                        poolSize: snapshot.view.count, seats: seats, playersOpen: playersOpen,
                        showsMenu: menuModel.showsButton, menuOpen: hostMenu == .menu, menuFocus: $dotsFocused,
                        onTogglePlayers: { playersOpen.toggle() },
                        onMenu: { hostMenu = hostMenu == .menu ? nil : .menu })
    }

    /// The bottom sheet, pinned to the screen's bottom edge and clear of the keyboard; expanded, it
    /// sits over a scrim that collapses it on tap.
    private var sheet: some View {
        GeometryReader { geo in
            let inset = geo.safeAreaInsets.bottom
            let screen = geo.size.height + geo.safeAreaInsets.top + inset
            ZStack(alignment: .bottom) {
                if sheetExpanded {
                    Color.risoScrim
                        .contentShape(Rectangle())
                        .onTapGesture { sheetExpanded = false }
                        .accessibilityHidden(true)
                        .transition(.opacity)
                }
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    LobbySheetView(snapshot: snapshot, isHost: isHost, bottomInset: inset, expanded: $sheetExpanded,
                                   maxHeight: min(screen * 0.66, 620),
                                   onLaunch: requestLaunch, launchBusy: launchModel.busy, launchError: launchModel.error,
                                   animateWaiting: animateWaiting)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                        // The pool pads for the collapsed sheet; the expanded one floats over the scrim.
                        if !sheetExpanded { sheetHeight = max(0, $0 - inset) }
                    }
                }
            }
            .ignoresSafeArea(edges: [.top, .bottom])
            .animation(reduceMotion ? nil : LobbySheetView.spring, value: sheetExpanded)
        }
        .ignoresSafeArea(.keyboard)
    }

    /// "Launch?" with the unbound names as dashed chips: Cancel / Launch.
    @ViewBuilder
    private var launchConfirm: some View {
        if !launchModel.confirming.isEmpty {
            RisoDialog(title: "Launch?", onClose: { launchModel.cancel() }) {
                FlowLayout(spacing: 8) {
                    ForEach(launchModel.confirming) { UnboundNameChip(name: $0.display) }
                }
                HStack(alignment: .top, spacing: 8) {
                    RisoButton(title: "Cancel", kind: .ghost, fullWidth: true) { launchModel.cancel() }
                    RisoButton(title: "Launch", kind: .dark, fullWidth: true) { confirmLaunch() }
                }
                .padding(.top, 4)
            }
            .accessibilityIdentifier("launch-confirm")
        }
    }

    private func requestLaunch() {
        let roster = snapshot.roster
        _Concurrency.Task { await launchModel.request(roster: roster) { try await service.launch(gameId: gameId) } }
    }

    private func confirmLaunch() {
        _Concurrency.Task { await launchModel.confirm { try await service.launch(gameId: gameId) } }
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

/// The lobby header (README §3): large "Pool" title with the "{mine} / {needed}" count and the
/// "{n} in pool" total; the avatar stack
/// and the game dots menu on the right. At large text
/// sizes the avatars and menu wrap under the title.
struct LobbyHeaderView: View {
    /// "{dealable to me} / {tasks per board}" (`LobbyLogic.poolCount`).
    let count: String
    /// The host's game name, shown under the title when set.
    var gameName: String? = nil
    /// Every task in the pool.
    let poolSize: Int
    /// Seats in join order.
    let seats: [Seat]
    let playersOpen: Bool
    let showsMenu: Bool
    var menuOpen = false
    var menuFocus: AccessibilityFocusState<Bool>.Binding
    let onTogglePlayers: () -> Void
    let onMenu: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
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
            // Under "Pool", outside the fit test so a long name never pushes the avatars to a second line.
            if let gameName, !gameName.isEmpty {
                Text(gameName)
                    .font(.risoBody(13, .semibold))
                    .foregroundStyle(Color.risoMuted)
                    .lineLimit(1)
                    .accessibilityIdentifier("game-name")
            }
        }
    }

    private var title: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("Pool")
                .font(.risoHead(34, .extraBold))
                .tracking(-0.85)
                .foregroundStyle(Color.risoInk)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Text(count)
                .font(.risoHead(17, .extraBold))
                .foregroundStyle(Color.risoMuted)
                .lineLimit(1)
                .accessibilityIdentifier("pool-count")
            Text("\(poolSize) in pool")
                .font(.risoBody(13, .bold))
                .foregroundStyle(Color.risoMuted)
                .lineLimit(1)
        }
        .fixedSize()
    }

    private var actions: some View {
        HStack(spacing: 10) {
            AvatarStack(seats: seats, max: 3, expanded: playersOpen, onToggle: onTogglePlayers)
                .padding(.trailing, 6)
            if showsMenu {
                HostMenuButton(open: menuOpen, focus: menuFocus, action: onMenu)
            }
        }
        .fixedSize()
    }
}
