import SwiftUI

/// The host's sheet for one roster name (a `.medium` detent from the lobby): the name, a radio
/// list of the joined players then "Nobody yet", Done, and a quiet red "Not coming" that confirms
/// before retiring the name. A row tap binds at once; the radio follows the server's roster, never
/// the tap, and every row is disabled while a call is in flight.
struct BindNameSheetView: View {
    /// The roster name as the latest snapshot has it.
    let name: RosterName
    /// Joined players in join order.
    let seats: [Seat]
    let onDone: () -> Void
    @StateObject private var model: NameBindingModel
    @State var confirming: Bool

    init(name: RosterName, seats: [Seat], service: GameService, gameId: String, confirming: Bool = false,
         onDone: @escaping () -> Void) {
        self.name = name
        self.seats = seats
        self.onDone = onDone
        _model = StateObject(wrappedValue: NameBindingModel(service: service, gameId: gameId, key: name.key))
        _confirming = State(initialValue: confirming)
    }

    private var busy: Bool { model.busy || model.retiring }

    var body: some View {
        ZStack {
            Color.risoPaper2.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text(name.display)
                    .font(.risoHead(28, .extraBold))
                    .tracking(-0.56)
                    .foregroundStyle(Color.risoInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(Array(seats.enumerated()), id: \.element.seatId) { i, seat in
                            if i > 0 { hairline }
                            row(seat.name, selected: name.seatId == seat.seatId) { bind(seat.seatId) }
                        }
                        if !seats.isEmpty { hairline }
                        row("Nobody yet", selected: name.seatId == nil) { bind(nil) }
                    }
                    .risoCard(fill: .risoPaper)
                    .padding(.trailing, Riso.Keyline.container)
                }
                .scrollBounceBehavior(.basedOnSize)
                .disabled(busy)
                .accessibilityIdentifier("bind-name-list")
                if let error = model.error { ErrorText(error) }
                HStack(alignment: .center, spacing: 12) {
                    Button { model.clearRetireError(); confirming = true } label: {
                        Text("Not coming")
                            .font(.risoHead(15, .bold))
                            .foregroundStyle(Color.risoDanger)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)
                    Spacer(minLength: 0)
                    RisoButton(title: "Done", kind: .ghost, action: onDone)
                }
            }
            .padding(.horizontal, Riso.gutter)
            .padding(.top, 28)
            .padding(.bottom, 12)
            .frame(maxWidth: 480, maxHeight: .infinity, alignment: .top)
            .accessibilityHidden(confirming)
            if confirming { confirm }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("bind-name-sheet")
    }

    private var hairline: some View {
        Rectangle().fill(Color.risoHair).frame(height: 1).accessibilityHidden(true)
    }

    /// One radio row: the label and a 22pt ring, filled with ink when selected.
    private func row(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(label)
                    .font(.risoHead(16, .bold))
                    .foregroundStyle(Color.risoInk)
                    .lineLimit(1)
                Spacer(minLength: 0)
                ZStack {
                    Circle().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container)
                    if selected { Circle().fill(Color.risoInk).padding(5) }
                }
                .frame(width: 22, height: 22)
                .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .contentShape(Rectangle())
            .opacity(busy ? 0.45 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// "Not coming?" over the sheet: Cancel / Remove.
    private var confirm: some View {
        RisoDialog(title: "Not coming?", onClose: { if !model.retiring { confirming = false } }) {
            if let error = model.retireError { ErrorText(error) }
            HStack(alignment: .top, spacing: 8) {
                RisoButton(title: "Cancel", kind: .ghost, fullWidth: true) { confirming = false }
                RisoButton(title: "Remove", kind: .primary, fullWidth: true) { retire() }
                    .risoDisabled(model.retiring)
            }
            .padding(.top, 4)
        }
    }

    private func bind(_ seatId: String?) {
        let current = name.seatId
        _Concurrency.Task { await model.bind(seatId, current: current) }
    }

    private func retire() {
        _Concurrency.Task {
            if await model.retire() {
                confirming = false
                onDone()
            }
        }
    }
}
