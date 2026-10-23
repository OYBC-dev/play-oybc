import Foundation

/// Line ids (`row_n`, `col_n`, `diag_main`, `diag_anti`) to cell indices (web `cellsInLines.ts`).
enum BoardLines {
    /// Cell indices (5x5, row-major) of one line id, or [] if unknown.
    static func cells(of line: String) -> [Int] {
        let n = GameConstants.gridSize
        let range = Array(0..<n)
        if line == "diag_main" { return range.map { $0 * n + $0 } }
        if line == "diag_anti" { return range.map { $0 * n + (n - 1 - $0) } }
        let parts = line.split(separator: "_")
        guard parts.count == 2, let k = Int(parts[1]), (0..<n).contains(k), parts[1].count == 1 else { return [] }
        switch parts[0] {
        case "row": return range.map { k * n + $0 }
        case "col": return range.map { $0 * n + k }
        default: return []
        }
    }

    /// Every cell index in any of the given completed lines.
    static func cells(in lines: [String]) -> Set<Int> { Set(lines.flatMap(cells(of:))) }
}
