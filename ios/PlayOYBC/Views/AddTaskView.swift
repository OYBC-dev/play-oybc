import SwiftUI

/// Task entry with @mention autocomplete (web `AddTaskForm` + `MentionAutocomplete`).
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
        VStack(alignment: .leading, spacing: 10) {
            TextField("Something that might happen", text: $text)
                .accessibilityLabel("Task")
                .focused($focused)
                .autocorrectionDisabled()
                .submitLabel(.done)
                .onSubmit { if let first = options.first { pick(first) } else { submit() } }
                .font(.risoBody(16, .medium))
                .foregroundStyle(Color.risoInk)
                .tint(Color.risoBlue)
                .padding(.horizontal, 12)
                .frame(minHeight: 48)
                .background(RoundedRectangle(cornerRadius: Riso.cardRadius).fill(Color.risoPaper2))
                .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Color.risoInk, lineWidth: 2))
                .onChange(of: text) { _, v in
                    if v.count > GameConstants.maxTaskLength { text = String(v.prefix(GameConstants.maxTaskLength)) }
                    dismissed = false
                }
            if !options.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(options, id: \.self) { name in
                        Button { pick(name) } label: {
                            Text(name)
                                .font(.risoBody(15, .bold))
                                .foregroundStyle(Color.risoInk)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 44)
                                .risoCard(radius: 16, fill: .risoPaper)
                                .fixedSize()
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .risoCard()
                .risoHardShadow(Riso.Shadow.button)
                .accessibilityLabel("Mentions")
            }
            if let error { ErrorText(error) }
            RisoButton(title: "Add", kind: .primary, fullWidth: true) { submit() }
                .risoDisabled(!canSubmit)
        }
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
