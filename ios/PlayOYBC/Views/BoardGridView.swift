import SwiftUI

/// The 5×5 board (web `BoardGrid`). Tap flips a square (optimism lives in `GameViewModel`);
/// hold shows the full task text. A square in flight is disabled at once and only dims after
/// 250 ms (`slow`), so fast acks never flicker.
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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Width of the grid, for the line clamp (one cell = a fifth, less gaps).
    @State private var gridWidth: CGFloat = 0

    private var gap: CGFloat { readOnly ? 5 : 6 }
    /// Room on the right / bottom for the last column's and row's hard shadow.
    private static let shadowRoom: CGFloat = Riso.Shadow.small

    var body: some View {
        let highlighted = BoardLines.cells(in: board.completedLines)
        let side = max(0, (gridWidth - Self.shadowRoom - gap * CGFloat(GameConstants.gridSize - 1)) / CGFloat(GameConstants.gridSize))
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: gap), count: GameConstants.gridSize), spacing: gap) {
                ForEach(board.cells.indices, id: \.self) { i in
                    cell(i, highlighted: highlighted.contains(i), lineLimit: CellStyle.lineLimit(cellSide: side))
                }
            }
            .padding(.trailing, Self.shadowRoom)
            .padding(.bottom, Self.shadowRoom)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { gridWidth = $0 }
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

    @ViewBuilder private func cell(_ i: Int, highlighted: Bool, lineLimit: Int) -> some View {
        let cell = board.cells[i]
        let free = cell == .free
        // Task text arrives mention-resolved from the server; shown as is.
        let text: String = { if case let .task(_, t) = cell { return t }; return "Free" }()
        let marked = free || (board.marks.indices.contains(i) && board.marks[i])
        let style = CellStyle(free: free, marked: marked, highlighted: highlighted, pending: !readOnly && slow.contains(i))
        let shape = RoundedRectangle(cornerRadius: Riso.cellRadius)
        ZStack(alignment: free ? .center : .topLeading) {
            if style.halftone {
                shape.fill(style.fill).risoHalftone(tile: 9, layerOpacity: 0.52, dotOpacity: 0.27)
            } else {
                shape.fill(style.fill)
            }
            label(text, free: free, lineLimit: lineLimit)
                .foregroundStyle(style.foreground)
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.risoInk, lineWidth: 2))
        .background(shape.fill(Color.risoShadowInk).offset(x: Riso.Shadow.small, y: Riso.Shadow.small).opacity(style.showsShadow ? 1 : 0))
        .opacity(style.opacity)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: style.pending)
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

    /// Free: Bricolage 800 16 centred. Tasks: Archivo 600 10, top-left, clamped.
    @ViewBuilder private func label(_ text: String, free: Bool, lineLimit: Int) -> some View {
        if free {
            Text(text).font(.risoHead(16, .extraBold))
        } else {
            Text(text)
                .font(.risoBody(10, .semibold))
                .tracking(-0.1)
                .lineSpacing(0.5)
                .multilineTextAlignment(.leading)
                .lineLimit(lineLimit)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                // 2pt keyline + 5pt padding (web `padding: 5px` inside the border).
                .padding(7)
        }
    }
}

/// One square's look (README §5): free = ink with paper "Free"; in a completed line = gold,
/// ink-static text, halftone overprint; marked = red with on-color text; unmarked = paper-2.
/// A square in flight past 250 ms (`pending`) dims to 55% and drops its shadow.
struct CellStyle: Equatable {
    var free: Bool
    var marked: Bool
    var highlighted: Bool
    var pending: Bool = false

    /// In a completed line (the free square keeps its ink look).
    private var inLine: Bool { !free && marked && highlighted }

    var fill: Color {
        if free { return .risoInk }
        if inLine { return .risoGold }
        return marked ? .risoRed : .risoPaper2
    }

    var foreground: Color {
        // Paper on ink: both adaptive, so "Free" reads in either mode (on-color would vanish
        // on the cream dark-mode ink).
        if free { return .risoPaper }
        if inLine { return .risoInkStatic }
        return marked ? .risoOnColor : .risoInk
    }

    /// Halftone overprint on completed-line squares.
    var halftone: Bool { inLine }

    var opacity: Double { pending ? 0.55 : 1 }

    var showsShadow: Bool { !pending }

    /// Task text clamp: five lines once a square is big enough for five 11.5pt lines
    /// (57.5pt of content, so a 71.5pt square), else four, so no line is cut in half (web
    /// `BoardGrid.module.css`).
    static func lineLimit(cellSide: CGFloat) -> Int { cellSide >= 71.5 ? 5 : 4 }
}
