import Foundation

/// The `@partial` being typed (web `lobby/mentions.ts`). `start` is the offset of the `@`.
struct ActiveMention: Equatable {
    var start: Int
    var partial: String
}

/// @mention helpers shared by the task entry field.
enum Mentions {
    private static func isWord(_ c: Character?) -> Bool {
        guard let c else { return false }
        return c.isLetter || c.isNumber
    }

    private static func isNameChar(_ c: Character) -> Bool {
        c.isLetter || c.isNumber || c == "'" || c == "’" || c == " " || c == "-"
    }

    /// The mention being typed right before `caret` (a character offset), or nil.
    static func active(in text: String, caret: Int) -> ActiveMention? {
        let before = Array(text.prefix(caret))
        var i = before.count
        while i > 0, isNameChar(before[i - 1]) { i -= 1 }
        guard i > 0, before[i - 1] == "@" else { return nil }
        let start = i - 1
        if start > 0, isWord(before[start - 1]) { return nil }
        let raw = String(before[i...])
        if raw.first?.isWhitespace == true { return nil }
        var partial = ""
        for c in raw where !(c == " " && partial.last == " ") { partial.append(c) }
        return ActiveMention(start: start, partial: partial)
    }

    /// What an autocomplete row stands for.
    enum Kind: Equatable {
        /// A joined player.
        case player
        /// A roster name the host bound to a player.
        case bound
        /// A roster name nobody here carries yet.
        case unbound
        /// `someone` / `anyone`.
        case keyword
        /// The typed partial as a new name.
        case add
    }

    /// One autocomplete row: `name` is what `pick` inserts after the `@`.
    struct Option: Equatable, Hashable {
        var name: String
        var kind: Kind
    }

    /// Rows offered for a partial, in order (web `mentionOptions`; keep both identical): other
    /// players by case-insensitive prefix, roster names bound to a player (not to you: that would
    /// be a self-mention), unbound roster names, someone / anyone, then one `.add` row for the typed
    /// partial. The add row needs a single word (no whitespace: past a space the person is typing
    /// the task) of at least `minAddLength` characters that is a valid name, matches no row or
    /// roster name exactly, is not the start of a present name or a keyword (that is them being
    /// typed), and is not a near-miss of a present name (the server refuses those).
    /// - Parameters:
    ///   - partial: the text after the `@`.
    ///   - seatNames: the other players' names (not you), in display order.
    ///   - roster: the game's roster (names the pool mentions that no seat owns).
    ///   - selfName: this seat's own name; never offered, and gates the add row like any present name.
    ///   - selfSeatId: this seat's id; a roster name bound to it is not offered.
    /// - Returns: the rows, in display order.
    static func options(partial: String, seatNames: [String], roster: [RosterName] = [], selfName: String? = nil,
                        selfSeatId: String? = nil) -> [Option] {
        let p = key(partial)
        let matches: (String) -> Bool = { key($0).hasPrefix(p) }
        var rows = seatNames.filter(matches).map { Option(name: $0, kind: .player) }
        rows += roster.filter { $0.seatId != nil && $0.seatId != selfSeatId && matches($0.display) }
            .map { Option(name: $0.display, kind: .bound) }
        rows += roster.filter { $0.seatId == nil && matches($0.display) }.map { Option(name: $0.display, kind: .unbound) }
        rows += keywords.filter(matches).map { Option(name: $0, kind: .keyword) }
        if let add = addRow(partial: partial, rows: rows, roster: roster, present: seatNames + [selfName].compactMap { $0 }) {
            rows.append(add)
        }
        return rows
    }

    /// Fewest characters the add row offers (one stray character never creates a name).
    static let minAddLength = 2

    private static let keywords = ["someone", "anyone"]

    /// The `.add` row for `partial`, or nil (see `options`).
    private static func addRow(partial: String, rows: [Option], roster: [RosterName], present: [String]) -> Option? {
        guard !partial.contains(where: \.isWhitespace), let name = normalizeName(partial), name.count >= minAddLength
        else { return nil }
        let k = key(name)
        let taken = (rows.map(\.name) + roster.map(\.display) + present + keywords).contains { key($0) == k }
        let near = (present + keywords).contains { key($0).hasPrefix(k) }
            || present.contains { isNearName(k, seatKey: key($0)) }
        return taken || near ? nil : Option(name: name, kind: .add)
    }

    /// The row Return picks: the first row, unless it is the add row (Return then submits the task
    /// as typed; the add row is picked by tap only).
    /// - Parameter options: the rows on show.
    /// - Returns: the row to pick, or nil to submit.
    static func returnPick(_ options: [Option]) -> Option? {
        guard let first = options.first, first.kind != .add else { return nil }
        return first
    }

    /// A display name as the server normalizes it (game-core `normalizeName`): trimmed, whitespace
    /// collapsed, 1–20 letters / digits / spaces / apostrophes / hyphens, not `someone` / `anyone`.
    /// - Returns: the normalized name, or nil when invalid.
    static func normalizeName(_ raw: String) -> String? {
        let name = raw.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard (1...20).contains(name.count), name.allSatisfy(isNameChar) else { return nil }
        guard !["someone", "anyone"].contains(name.lowercased()) else { return nil }
        return name
    }

    /// Whether name key `key` plausibly names the seat with `seatKey` (game-core `isNearName`): the
    /// same key, its first word, that word plus "s", or a 3+ char prefix of that word.
    static func isNearName(_ key: String, seatKey: String) -> Bool {
        if key == seatKey { return true }
        let first = seatKey.split(separator: " ").first.map(String.init) ?? seatKey
        if key == first || key == first + "s" { return true }
        return key.count >= 3 && first.hasPrefix(key)
    }

    /// Case-, whitespace- and apostrophe-insensitive key (game-core `nameKey`).
    static func key(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
            .replacingOccurrences(of: "’", with: "'").replacingOccurrences(of: "‘", with: "'").lowercased()
    }

    /// Replaces the mention with `@name ` and caps the text at the task length.
    /// - Returns: the new text and caret offset.
    static func pick(_ name: String, mention: ActiveMention, in text: String, caret: Int) -> (text: String, caret: Int) {
        let chars = Array(text)
        let insert = "@\(name) "
        let next = String(chars[..<mention.start]) + insert + String(chars[min(caret, chars.count)...])
        return (String(next.prefix(GameConstants.maxTaskLength)), mention.start + insert.count)
    }
}
