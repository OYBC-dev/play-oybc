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

    @State var text = ""
    @State var error: String?
    @State var busy = false
    @State var dismissed = false
    @FocusState private var focused: Bool

    init(service: GameService, gameId: String, seatNames: [String], roster: [RosterName] = [], selfName: String? = nil) {
        self.service = service
        self.gameId = gameId
        self.seatNames = seatNames
        self.roster = roster
        self.selfName = selfName
    }

    private var mention: ActiveMention? {
        dismissed ? nil : Mentions.active(in: text, caret: text.count)
    }

    private var options: [Mentions.Option] {
        guard focused, let mention else { return [] }
        return Mentions.options(partial: mention.partial, seatNames: seatNames, roster: roster, selfName: selfName)
    }

    private var canSubmit: Bool { !busy && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                field
                RisoButton(title: "Add") { submit() }
                    .risoDisabled(!canSubmit)
            }
            .overlay(alignment: .topLeading) {
                if !options.isEmpty { autocomplete.offset(y: 56) }
            }
            .zIndex(1)
            // The mention card floats where the error sits; the error shows again once it closes.
            if let error, options.isEmpty { ErrorText(error) }
        }
    }

    private var field: some View {
        TextField("", text: $text,
                  prompt: Text("Add to the pool").font(.risoBody(15, .semibold)).foregroundStyle(Color.risoMuted))
            .accessibilityLabel("Task")
            .focused($focused)
            .autocorrectionDisabled()
            .submitLabel(.done)
            .onSubmit { if let first = options.first { pick(first.name) } else { submit() } }
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

    /// Suggestion card floating under the field (web `MentionAutocomplete`).
    private var autocomplete: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(options, id: \.self) { option in
                Button { pick(option.name) } label: {
                    HStack(spacing: 10) {
                        MentionGlyph(kind: option.kind)
                        Text(option.name).foregroundStyle(Color.risoInk).lineLimit(1)
                    }
                    .font(.risoHead(15, .bold))
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
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

/// The leading glyph of an autocomplete row: `@` for players, bound names and keywords; `@` in a
/// dashed ring for a name nobody here carries yet; a blue `+` for a new name.
struct MentionGlyph: View {
    let kind: Mentions.Kind

    var body: some View {
        Group {
            switch kind {
            case .add:
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Color.risoBlue)
                    .frame(width: 22, height: 22)
            case .unbound:
                Text("@")
                    .font(.risoHead(12, .bold))
                    .foregroundStyle(Color.risoMuted)
                    .frame(width: 22, height: 22)
                    .overlay(Circle().strokeBorder(Color.risoMuted, style: StrokeStyle(lineWidth: 2, dash: [3])))
            case .player, .bound, .keyword:
                // Muted, not blue: blue is never text on paper.
                Text("@").foregroundStyle(Color.risoMuted)
            }
        }
        .accessibilityHidden(true)
    }
}
