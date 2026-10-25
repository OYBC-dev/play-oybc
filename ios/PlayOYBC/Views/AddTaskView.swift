import SwiftUI

/// The lobby composer: task field + neutral Add, with @mention autocomplete floating under
/// the field (web `AddTaskForm` + `MentionAutocomplete`).
/// The caret is taken to be the end of the text (SwiftUI exposes no selection for TextField).
struct AddTaskView: View {
    let service: GameService
    let gameId: String
    /// Names of the other players (not you), in display order.
    let seatNames: [String]

    @State var text = ""
    @State var error: String?
    @State var busy = false
    @State var dismissed = false
    @FocusState private var focused: Bool

    init(service: GameService, gameId: String, seatNames: [String]) {
        self.service = service
        self.gameId = gameId
        self.seatNames = seatNames
    }

    private var mention: ActiveMention? {
        dismissed ? nil : Mentions.active(in: text, caret: text.count)
    }

    private var options: [String] {
        guard focused, let mention else { return [] }
        return Mentions.options(partial: mention.partial, seatNames: seatNames)
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
            .onSubmit { if let first = options.first { pick(first) } else { submit() } }
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
            ForEach(options, id: \.self) { name in
                Button { pick(name) } label: {
                    HStack(spacing: 10) {
                        // Muted, not blue: blue is never text on paper.
                        Text("@").foregroundStyle(Color.risoMuted).accessibilityHidden(true)
                        Text(name).foregroundStyle(Color.risoInk).lineLimit(1)
                    }
                    .font(.risoHead(15, .bold))
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
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
