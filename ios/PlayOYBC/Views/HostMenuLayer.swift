import SwiftUI

// MARK: - Dots button

/// Where the dots button sits, so the menu can hang under it.
struct HostMenuAnchorKey: PreferenceKey {
    static var defaultValue: Anchor<CGRect>?
    static func reduce(value: inout Anchor<CGRect>?, nextValue: () -> Anchor<CGRect>?) {
        value = value ?? nextValue()
    }
}

/// The game menu's 44pt dots button, for every seat (web `HostMenu` trigger): paper-2 keyline tile, 3pt hard shadow.
/// Publishes its bounds for `hostMenu(...)`, which draws the menu and dialogs.
struct HostMenuButton: View {
    let open: Bool
    /// VoiceOver focus returns here when the menu or a dialog closes.
    var focus: AccessibilityFocusState<Bool>.Binding
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "ellipsis")
                .font(.system(size: 18, weight: .heavy))
                .foregroundStyle(Color.risoInk)
                .frame(width: 44, height: 44)
                .risoCard()
        }
        .buttonStyle(RisoButtonStyle())
        .accessibilityLabel("Menu")
        .accessibilityValue(open ? "Expanded" : "Collapsed")
        .accessibilityFocused(focus)
        .anchorPreference(key: HostMenuAnchorKey.self, value: .bounds) { $0 }
    }
}

// MARK: - Menu + dialogs layer

extension View {
    /// Draws the game menu under the dots button and the host's Make host / End game dialogs
    /// over this view. Apply it to the screen's root so the scrim covers everything.
    ///
    /// - Parameters:
    ///   - stage: What is open; nil when closed.
    ///   - model: What the menu offers.
    ///   - service: Performs the transfer / end calls.
    ///   - gameId: The game.
    ///   - triggerFocus: The dots button's VoiceOver focus, restored on close.
    ///   - onLeave: "Leave game": forget the game on this device and go Home (no confirm; rejoining by code restores the seat).
    ///   - onRoster: "Roster" (host, lobby): expand the player chip list. Nil leaves the item out.
    func hostMenu(stage: Binding<HostMenuStage?>, model: HostMenuModel, service: GameService, gameId: String,
                  triggerFocus: AccessibilityFocusState<Bool>.Binding, onLeave: @escaping () -> Void,
                  onRoster: (() -> Void)? = nil) -> some View {
        modifier(HostMenuLayer(stage: stage, model: model, service: service, gameId: gameId, triggerFocus: triggerFocus,
                               onLeave: onLeave, onRoster: onRoster))
    }
}

private struct HostMenuLayer: ViewModifier {
    @Binding var stage: HostMenuStage?
    let model: HostMenuModel
    let service: GameService
    let gameId: String
    var triggerFocus: AccessibilityFocusState<Bool>.Binding
    let onLeave: () -> Void
    let onRoster: (() -> Void)?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let menuWidth: CGFloat = 216

    func body(content: Content) -> some View {
        content
            .overlayPreferenceValue(HostMenuAnchorKey.self) { anchor in
                GeometryReader { geo in
                    if model.showsButton, stage == .menu, let anchor {
                        let button = geo[anchor]
                        ZStack(alignment: .topLeading) {
                            // Outside tap closes (and swallows the tap, like the web popover).
                            Color.clear
                                .contentShape(Rectangle())
                                .onTapGesture(perform: close)
                                .accessibilityHidden(true)
                            HostMenuCard(model: model, onMakeHost: { stage = .makeHost },
                                         onEndGame: { stage = .endGame }, onLeave: leave, onClose: close,
                                         onRoster: onRoster.map { open in { roster(open) } })
                                .frame(width: Self.menuWidth)
                                .padding(.leading, max(0, button.maxX - Self.menuWidth))
                                .padding(.top, button.maxY + 8)
                        }
                        .transition(.opacity)
                    }
                }
            }
            .overlay {
                if model.isHost {
                    switch stage {
                    case .makeHost:
                        MakeHostDialog(service: service, gameId: gameId, candidates: model.candidates, onClose: close)
                            .transition(.opacity)
                    case .endGame where model.showsEndGame:
                        EndGameDialog(service: service, gameId: gameId, inLobby: model.inLobby, onClose: close)
                            .transition(.opacity)
                    default:
                        EmptyView()
                    }
                }
            }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: stage)
    }

    private func close() {
        stage = nil
        // After the overlay leaves the accessibility tree, or VoiceOver ignores the request.
        DispatchQueue.main.async { triggerFocus.wrappedValue = true }
    }

    private func roster(_ open: () -> Void) {
        stage = nil
        open()
    }

    private func leave() {
        stage = nil
        onLeave()
    }
}

// MARK: - Menu card

/// The 216pt popover menu (README §8 Menu). The host gets "Make host" (disabled with no other
/// players), "Roster" in the lobby once the pool mentions a name (with a dashed count of the
/// unbound names, hidden at 0) and a red "End game", then a hairline; every seat gets "Leave game"
/// (web `HostMenu`).
struct HostMenuCard: View {
    let model: HostMenuModel
    let onMakeHost: () -> Void
    let onEndGame: () -> Void
    let onLeave: () -> Void
    let onClose: () -> Void
    /// Expands the player chip list; nil leaves "Roster" out.
    var onRoster: (() -> Void)?

    private enum Item: Hashable { case makeHost, roster, endGame, leave }

    /// "Roster" is drawn (the model offers it and the screen handles it).
    var showsRoster: Bool { model.showsRoster && onRoster != nil }
    /// The Roster row's dashed count bubble, or nil (hidden at 0).
    var rosterCount: String? { model.unboundCount > 0 ? "\(model.unboundCount)" : nil }
    @AccessibilityFocusState private var focus: Item?

    /// The first enabled item, which takes VoiceOver focus on open (as web does).
    private var firstItem: Item {
        if model.showsMakeHost && model.makeHostEnabled { return .makeHost }
        if showsRoster { return .roster }
        return model.showsEndGame ? .endGame : .leave
    }

    var body: some View {
        VStack(spacing: 0) {
            if model.showsMakeHost {
                item("Make host", systemImage: "person", color: .risoInk, enabled: model.makeHostEnabled, action: onMakeHost)
                    .accessibilityFocused($focus, equals: .makeHost)
            }
            if showsRoster, let onRoster {
                rosterItem(action: onRoster)
                    .accessibilityFocused($focus, equals: .roster)
            }
            if model.showsEndGame {
                item("End game", systemImage: "rectangle.portrait.and.arrow.right", color: .risoDanger, enabled: true, action: onEndGame)
                    .accessibilityFocused($focus, equals: .endGame)
            }
            if model.showsMakeHost || model.showsEndGame {
                Rectangle()
                    .fill(Color.risoHair)
                    .frame(height: 1)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .accessibilityHidden(true)
            }
            if model.showsLeave {
                item("Leave game", systemImage: "arrow.backward.square", color: .risoInk, enabled: true, action: onLeave)
                    .accessibilityFocused($focus, equals: .leave)
            }
        }
        .padding(6)
        .risoCard()
        .risoHardShadow(Riso.Shadow.large)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityLabel("Menu")
        .accessibilityAction(.escape, onClose)
        .onAppear {
            // Focus the first enabled item, as web does.
            DispatchQueue.main.async { focus = firstItem }
        }
    }

    private func item(_ title: String, systemImage: String, color: Color, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 18, height: 18)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.risoHead(15, .bold))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .foregroundStyle(color)
            .padding(.horizontal, 12)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuItemStyle())
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }
}

extension HostMenuCard {
    /// "Roster": a list glyph, the label and, while names are unbound, a dashed count bubble.
    fileprivate func rosterItem(action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "list.bullet")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 18, height: 18)
                    .accessibilityHidden(true)
                Text("Roster")
                    .font(.risoHead(15, .bold))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if let rosterCount {
                    Text(rosterCount)
                        .font(.risoHead(12, .extraBold))
                        .foregroundStyle(Color.risoMuted)
                        .padding(.horizontal, 6)
                        .frame(minWidth: 22, minHeight: 22)
                        .overlay(Capsule().strokeBorder(Color.risoInk, style: Riso.dashedKeyline))
                        .accessibilityIdentifier("roster-unbound-count")
                }
            }
            .foregroundStyle(Color.risoInk)
            .padding(.horizontal, 12)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuItemStyle())
        .accessibilityLabel("Roster")
        .accessibilityValue(model.unboundCount > 0 ? "\(model.unboundCount) unbound" : "")
        .accessibilityIdentifier("menu-roster")
    }
}

/// A menu row: pressed shows the paper fill (web `.item:hover`).
private struct MenuItemStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(RoundedRectangle(cornerRadius: 6).fill(configuration.isPressed ? Color.risoPaper : .clear))
    }
}

// MARK: - Dialogs

/// "Make host": a radio list of the other players, then "Make {Name} host" (web `MakeHostDialog`).
struct MakeHostDialog: View {
    let service: GameService
    let gameId: String
    /// Other seated players, in join order.
    let candidates: [Seat]
    let onClose: () -> Void
    @State var pickedId: String?
    @State var busy = false
    @State var error: String?

    /// A pick that left the game no longer counts.
    private var picked: Seat? { candidates.first { $0.seatId == pickedId } }

    var body: some View {
        RisoDialog(title: "Make host", onClose: onClose) {
            VStack(spacing: 0) {
                ForEach(candidates) { radio($0) }
            }
            if let error { ErrorText(error) }
            HStack(alignment: .top, spacing: 8) {
                RisoButton(title: "Cancel", kind: .ghost, fullWidth: true, action: onClose)
                RisoButton(title: picked.map { "Make \($0.name) host" } ?? "Make host", kind: .blue, fullWidth: true,
                           centersWrappedLabel: true) { transfer() }
                    .risoDisabled(picked == nil || busy)
            }
            .padding(.top, 4)
        }
    }

    private func radio(_ seat: Seat) -> some View {
        RisoRadioRow(label: seat.name, checked: picked?.seatId == seat.seatId) {
            error = nil
            pickedId = seat.seatId
        }
    }

    private func transfer() {
        guard let picked else { return }
        busy = true
        error = nil
        _Concurrency.Task {
            do {
                try await service.transferHost(gameId: gameId, toSeatId: picked.seatId)
                busy = false
                onClose()
            } catch {
                self.error = ErrorMessages.message(for: error)
                busy = false
            }
        }
    }
}

/// "End the game?" confirm (web `EndGameDialog`). In the lobby the marking/leaderboard line,
/// which only describes a game in play, is left out.
struct EndGameDialog: View {
    let service: GameService
    let gameId: String
    var inLobby = false
    let onClose: () -> Void
    @State var busy = false
    @State var error: String?

    var body: some View {
        RisoDialog(title: "End the game?", onClose: onClose) {
            if !inLobby {
                Text("Marking stops for everyone and the final leaderboard goes up.")
                    .font(.risoBody(15))
                    .lineSpacing(4)
                    .foregroundStyle(Color.risoInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let error { ErrorText(error) }
            HStack(alignment: .top, spacing: 8) {
                RisoButton(title: "Cancel", kind: .ghost, fullWidth: true, action: onClose)
                RisoButton(title: "End game", kind: .primary, fullWidth: true) { end() }
                    .risoDisabled(busy)
            }
            .padding(.top, 4)
        }
    }

    private func end() {
        busy = true
        error = nil
        _Concurrency.Task {
            do {
                try await service.end(gameId: gameId)
                busy = false
                onClose()
            } catch {
                self.error = ErrorMessages.message(for: error)
                busy = false
            }
        }
    }
}
