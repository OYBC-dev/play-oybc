import SwiftUI

/// The lobby composer: task field + neutral Add, with @mention autocomplete floating under
/// the field (web `AddTaskForm` + `MentionAutocomplete`).
/// The caret is taken to be the end of the text (SwiftUI exposes no selection for TextField).
struct AddTaskView: View {
    let service: GameService
    let gameId: String
    /// Names of the other players (not you), in display order.
    let seatNames: [String]
    /// Names the pool mentions that no seat owns (offered after the players).
    let roster: [RosterName]
    /// This seat's own name (never offered as a new name).
    let selfName: String?
    /// Every seat in join order (a player / bound row wears that seat's avatar).
    let seats: [Seat]
    /// This seat's id (a roster name bound to it is not offered).
    let selfSeatId: String?
    /// Opens "How tasks work" from the (i) bubble after Add; nil = no bubble.
    let onInfo: (() -> Void)?
    /// Each change focuses the task field (after the first-lobby explainer closes).
    let focusRequest: Int
    /// Each change moves VoiceOver focus back to the (i) bubble.
    let infoFocusRequest: Int

    @State var text = ""
    @State var error: String?
    @State var busy = false
    @State var dismissed = false
    @FocusState private var focused: Bool
    @AccessibilityFocusState private var infoFocused: Bool

    init(service: GameService, gameId: String, seatNames: [String], roster: [RosterName] = [], selfName: String? = nil,
         seats: [Seat] = [], selfSeatId: String? = nil, onInfo: (() -> Void)? = nil, focusRequest: Int = 0,
         infoFocusRequest: Int = 0) {
        self.onInfo = onInfo
        self.focusRequest = focusRequest
        self.infoFocusRequest = infoFocusRequest
        self.service = service
        self.gameId = gameId
        self.seatNames = seatNames
        self.roster = roster
        self.selfName = selfName
        self.seats = seats
        self.selfSeatId = selfSeatId
    }

    private var mention: ActiveMention? {
        dismissed ? nil : Mentions.active(in: text, caret: text.count)
    }

    private var options: [Mentions.Option] {
        guard focused, let mention else { return [] }
        return Mentions.options(partial: mention.partial, seatNames: seatNames, roster: roster, selfName: selfName,
                                selfSeatId: selfSeatId)
    }

    private var canSubmit: Bool { !busy && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                field
                RisoButton(title: "Add") { submit() }
                    .risoDisabled(!canSubmit)
                if let onInfo { infoBubble(onInfo) }
            }
            .overlay(alignment: .topLeading) {
                if !options.isEmpty { autocomplete.offset(y: 56) }
            }
            .zIndex(1)
            // The mention card floats where the error sits; the error shows again once it closes.
            if let error, options.isEmpty { ErrorText(error) }
        }
        .onChange(of: focusRequest) { _, _ in focused = true }
        .onChange(of: infoFocusRequest) { _, _ in
            // After the dialog leaves the tree, or VoiceOver drops the request.
            DispatchQueue.main.async { infoFocused = true }
        }
    }

    /// A 44pt target holding a 24pt circle outlined 2pt in muted with an `i` (Bricolage 800 13pt). The
    /// negative margins keep its visual gap to Add and to the edge as drawn.
    private func infoBubble(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text("i")
                .font(.risoHead(13, .extraBold))
                .foregroundStyle(Color.risoMuted)
                .frame(width: 24, height: 24)
                .overlay(Circle().strokeBorder(Color.risoMuted, lineWidth: Riso.Keyline.container))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.leading, -4)
        .padding(.trailing, -8)
        .accessibilityLabel("How tasks work")
        .accessibilityFocused($infoFocused)
        .accessibilityIdentifier("howto-info")
    }

    private var field: some View {
        TextField("", text: $text,
                  prompt: Text("Add to the pool").font(.risoBody(15, .semibold)).foregroundStyle(Color.risoMuted))
            .accessibilityLabel("Task")
            .focused($focused)
            .autocorrectionDisabled()
            .submitLabel(.done)
            // Return picks the first row, but never the add row: then it submits the task as typed.
            .onSubmit { if let row = Mentions.returnPick(options) { pick(row.name) } else { submit() } }
            .font(.risoBody(15, .medium))
            .foregroundStyle(Color.risoInk)
            .tint(Color.risoBlue)
            .padding(.horizontal, 14)
            .frame(height: 48)
            .background(RoundedRectangle(cornerRadius: Riso.cardRadius).fill(Color.risoPaper2))
            .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            .onChange(of: text) { _, v in
                if v.count > GameConstants.maxTaskLength { text = String(v.prefix(GameConstants.maxTaskLength)) }
                dismissed = false
            }
    }

    /// Suggestion card floating under the field (web `MentionAutocomplete`). The row Return
    /// would pick shows the active (paper) fill.
    private var autocomplete: some View {
        let active = Mentions.returnPick(options)
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(options, id: \.self) { option in
                Button { pick(option.name) } label: {
                    HStack(spacing: 10) {
                        MentionLeading(kind: option.kind, avatar: avatar(for: option))
                        rowLabel(option)
                    }
                    .font(.risoHead(15, .bold))
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 6).fill(option == active ? Color.risoPaper : .clear))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.kind == .add ? "Add \(option.name)" : option.name)
            }
        }
        .padding(6)
        .frame(minWidth: 210, alignment: .leading)
        .fixedSize()
        .risoCard()
        .risoHardShadow(Riso.Shadow.small)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Mentions")
    }

    /// `@` in blue then the name (muted for an unbound name); the add row shows the typed text alone.
    @ViewBuilder
    private func rowLabel(_ option: Mentions.Option) -> some View {
        if option.kind == .add {
            Text(option.name).foregroundStyle(Color.risoInk).lineLimit(1)
        } else {
            HStack(spacing: 2) {
                Text("@").foregroundStyle(Color.risoBlue).accessibilityHidden(true)
                Text(option.name).foregroundStyle(option.kind == .unbound ? Color.risoMuted : Color.risoInk)
            }
            .lineLimit(1)
        }
    }

    /// The seat whose avatar a player row (that player) or a bound row (its player) wears.
    private func avatar(for option: Mentions.Option) -> (name: String, index: Int)? {
        let seatId: String?
        switch option.kind {
        case .player:
            seatId = seats.first { Mentions.key($0.name) == Mentions.key(option.name) }?.seatId
        case .bound:
            seatId = roster.first { $0.display == option.name }?.seatId
        default:
            return nil
        }
        guard let seatId, let index = seats.firstIndex(where: { $0.seatId == seatId }) else { return nil }
        return (seats[index].name, index)
    }

    private func pick(_ name: String) {
        guard let mention else { return }
        text = Mentions.pick(name, mention: mention, in: text, caret: text.count).text
    }

    private func submit() {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !busy else { return }
        busy = true
        error = nil
        let sent = text
        _Concurrency.Task {
            do {
                try await service.addTask(gameId: gameId, text: body)
                // Keep anything typed while the call was in flight.
                if text == sent { text = "" }
            } catch {
                self.error = ErrorMessages.message(for: error)
            }
            busy = false
        }
    }
}
