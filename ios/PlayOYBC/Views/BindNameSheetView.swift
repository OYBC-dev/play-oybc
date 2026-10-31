import SwiftUI

/// The host's sheet for one roster name (a `.medium` detent from the lobby; web `BindNameSheet`):
/// paper-2 under a 2pt ink keyline with a 22pt top radius, like the lobby sheet. The name and a
/// ghost Done, a radio group of "Nobody yet" then the joined players in join order, and — only
/// while the name is unbound — a quiet red "Not coming" that confirms before retiring the name.
///
/// A row tap binds at once ("Nobody yet" unbinds); the tapped row stays selected until the
/// server's roster agrees (`NameBindingModel.pending`), and the rows are disabled while a call
/// is in flight.
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
    private var selected: String? { model.selection(current: name.seatId) }
    private static let shape = UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22)

    var body: some View {
        ZStack {
            VStack(alignment: .leading, spacing: 14) {
                header
                ScrollView {
                    VStack(spacing: 0) {
                        RisoRadioRow(label: "Nobody yet", checked: selected == nil, labelColor: .risoMuted) { bind(nil) }
                        ForEach(seats) { seat in
                            RisoRadioRow(label: seat.name, checked: selected == seat.seatId) { bind(seat.seatId) }
                        }
                    }
                }
                .scrollBounceBehavior(.basedOnSize)
                .disabled(busy)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Players")
                .accessibilityIdentifier("bind-name-list")
                if let error = model.error { ErrorText(error) }
                if name.seatId == nil { notComing }
            }
            .padding(.horizontal, 16)
            .padding(.top, 20)
            .padding(.bottom, 40)
            .frame(maxWidth: 480, maxHeight: .infinity, alignment: .top)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(confirming)
            if confirming { confirm }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(22)
        .presentationBackground {
            Self.shape.fill(Color.risoPaper2)
                .overlay(Self.shape.strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
                .padding(.bottom, -Riso.Keyline.container)
                .ignoresSafeArea()
        }
        .onChange(of: name.seatId, initial: true) { _, current in model.observe(current: current) }
        .accessibilityIdentifier("bind-name-sheet")
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(name.display)
                .font(.risoHead(26, .extraBold))
                .tracking(-0.52)
                .foregroundStyle(Color.risoInk)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            RisoButton(title: "Done", kind: .ghost, small: true, action: onDone)
                .risoHitSlop(6)
        }
    }

    /// Unbound names only: the person is not in the room, so the host can drop the name.
    private var notComing: some View {
        Button { model.clearRetireError(); confirming = true } label: {
            Text("Not coming")
                .font(.risoHead(15, .bold))
                .foregroundStyle(Color.risoDanger)
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityIdentifier("bind-not-coming")
    }

    /// "<Name> isn't coming?" over the sheet: Cancel / Not coming.
    private var confirm: some View {
        RisoDialog(title: "\(name.display) isn’t coming?", onClose: { if !model.retiring { confirming = false } }) {
            if let error = model.retireError { ErrorText(error) }
            HStack(alignment: .top, spacing: 8) {
                RisoButton(title: "Cancel", kind: .ghost, fullWidth: true) { confirming = false }
                RisoButton(title: "Not coming", kind: .primary, fullWidth: true) { retire() }
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
