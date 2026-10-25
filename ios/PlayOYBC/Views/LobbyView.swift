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
    @State var deleting: Set<String> = []
    @State var deleteError: String?
    @State var playersOpen = false
    /// Sheet height above the home-indicator safe area, for the scroll padding under it.
    @State private var sheetHeight: CGFloat = 150
    /// False freezes the waiting dots (snapshots).
    var animateWaiting = true

    private var isHost: Bool { snapshot.game.hostSeatId == snapshot.mySeatId }
    private var seats: [Seat] { LobbyLogic.seatsByJoin(snapshot.seats) }

    var body: some View {
        ZStack {
            RisoPaperBackground()
            ScrollView { content }.scrollDismissesKeyboard(.interactively)
        }
        .overlay { sheet }
        .accessibilityIdentifier("stage-lobby")
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 14) {
            if isHost { ReclaimPromptView(service: service, gameId: gameId, reclaims: snapshot.reclaims) }
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
            // Kept until the header dots menu replaces it (I4).
            HostMenuView(service: service, gameId: gameId, snapshot: snapshot)
        }
        .padding(.horizontal, Riso.gutter)
        .padding(.top, 10)
        .padding(.bottom, sheetHeight + 16)
        .frame(maxWidth: 480, alignment: .leading)
        .frame(maxWidth: .infinity)
    }

    /// Large "Pool" title with the "{n} / 24" count; the avatar stack on the right.
    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Pool")
                    .font(.risoHead(34, .extraBold))
                    .tracking(-0.85)
                    .foregroundStyle(Color.risoInk)
                    .accessibilityAddTraits(.isHeader)
                Text("\(snapshot.view.count) / \(GameConstants.minPoolSize)")
                    .font(.risoHead(17, .extraBold))
                    .foregroundStyle(Color.risoMuted)
                    .lineLimit(1)
                    .fixedSize()
            }
            Spacer(minLength: 0)
            AvatarStack(seats: seats, max: 5, expanded: playersOpen) { playersOpen.toggle() }
                .padding(.trailing, 6)
        }
        .frame(minHeight: 44)
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
