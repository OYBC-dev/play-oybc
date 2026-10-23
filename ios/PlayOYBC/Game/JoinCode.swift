import Foundation

/// Parses what a player typed or pasted into the Join field.
enum JoinCode {
    /// Accepts a bare code ("abcde") or a join link ("https://…/g/ABCDE?x").
    /// - Returns: the upper-cased code, or nil when nothing usable was entered.
    static func parse(_ input: String) -> String? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if let r = s.range(of: "/g/", options: [.backwards, .caseInsensitive]) {
            s = String(s[r.upperBound...])
            if let cut = s.firstIndex(where: { $0 == "/" || $0 == "?" || $0 == "#" }) { s = String(s[..<cut]) }
        }
        s = s.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return s.isEmpty ? nil : s
    }
}
