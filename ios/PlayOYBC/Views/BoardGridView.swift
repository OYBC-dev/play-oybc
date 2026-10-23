import SwiftUI

/// The 5×5 board (web `BoardGrid`). Tap flips a square (optimism lives in `GameViewModel`);
/// hold shows the full task text. Squares in a completed line are gold. A square in flight is
/// disabled at once and only dims after 250 ms.
struct BoardGridView: View {
    let board: BoardDoc
    /// Cells with a toggle call in flight.
    var pending: Set<Int> = []
    /// Cells in flight past the 250 ms threshold (`GameViewModel.slowCells`); drawn dimmed.
    var slow: Set<Int> = []
    /// Final boards: nothing is tappable.
    var readOnly = false
    /// The last failed toggle's message.
    var error: String?
    var onToggle: (Int) -> Void = { _ in }

    @State var detail: String?

    static let longPressSeconds = 0.45

    var body: some View {
        let highlighted = BoardLines.cells(in: board.completedLines)
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: GameConstants.gridSize), spacing: 4) {
                ForEach(board.cells.indices, id: \.self) { i in
                    cell(i, highlighted: highlighted.contains(i))
                }
            }
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
            if let error { ErrorText(error) }
        }
        .sheet(isPresented: Binding(get: { detail != nil }, set: { if !$0 { detail = nil } })) {
            RisoSheet(title: "Task", onClose: { detail = nil }) {
                Text(detail ?? "").font(.risoBody(18, .medium)).foregroundStyle(Color.risoInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder private func cell(_ i: Int, highlighted: Bool) -> some View {
        let cell = board.cells[i]
        let free = cell == .free
        let text: String = { if case let .task(_, t) = cell { return t }; return "Free" }()
        let marked = free || (board.marks.indices.contains(i) && board.marks[i])
        let style = CellStyle(free: free, marked: marked, highlighted: highlighted)
        RoundedRectangle(cornerRadius: Riso.cellRadius)
            .fill(style.fill)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                Text(text)
                    .font(free ? .risoHead(13, .extraBold) : .risoBody(12, .semibold))
                    .foregroundStyle(style.foreground)
                    .multilineTextAlignment(.center)
                    .lineLimit(4)
                    .padding(highlighted ? 6 : 5)
            }
            .overlay(RoundedRectangle(cornerRadius: Riso.cellRadius).strokeBorder(Color.risoInk, lineWidth: 2))
            .overlay {
                if highlighted {
                    RoundedRectangle(cornerRadius: Riso.cellRadius - 2).strokeBorder(Color.risoInkStatic, lineWidth: 2).padding(2)
                }
            }
            .opacity(slow.contains(i) ? 0.45 : 1)
            .contentShape(Rectangle())
            .onTapGesture {
                if !readOnly, !free, !pending.contains(i) { onToggle(i) }
            }
            .onLongPressGesture(minimumDuration: Self.longPressSeconds) {
                if !free { detail = text }
            }
            .accessibilityElement()
            .accessibilityLabel(text)
            .accessibilityAddTraits(free || readOnly ? [] : .isButton)
            .accessibilityAddTraits(marked && !free ? .isSelected : [])
            .accessibilityAction {
                if !readOnly, !free, !pending.contains(i) { onToggle(i) }
            }
            .accessibilityAction(named: "Details") { if !free { detail = text } }
    }
}

/// Fill and text colour of one square: free and completed-line squares are gold, marked red.
struct CellStyle: Equatable {
    var free: Bool
    var marked: Bool
    var highlighted: Bool

    var fill: Color {
        if free || highlighted { return .risoGold }
        return marked ? .risoRed : .risoPaper2
    }

    var foreground: Color {
        if free || highlighted { return .risoInkStatic }
        // Adaptive paper (ink in dark mode): cream on the lightened dark-mode red is below AA.
        return marked ? .risoPaper : .risoInk
    }
}
