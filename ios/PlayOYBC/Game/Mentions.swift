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

    /// Rows offered for a partial, in order: other players by case-insensitive prefix, roster names
    /// bound to a player, unbound roster names, someone / anyone, then one `.add` row for the typed
    /// partial when it is a valid one-word name (the server reads an unknown `@name` as one word) that
    /// matches none of them exactly and is not a near-miss of a player here, `selfName` included (the
    /// server refuses those). No `.add` row for a finished word (trailing space) or while the partial
    /// is still a prefix of someone / anyone.
    /// - Parameters:
    ///   - partial: the text after the `@`.
    ///   - seatNames: the other players' names, in display order.
    ///   - roster: the game's roster (names the pool mentions that no seat owns).
    ///   - selfName: this seat's own name; never offered as a new name.
    static func options(partial: String, seatNames: [String], roster: [RosterName] = [], selfName: String? = nil) -> [Option] {
        let p = key(partial)
        let matches: (String) -> Bool = { key($0).hasPrefix(p) }
        var rows = seatNames.filter(matches).map { Option(name: $0, kind: .player) }
        rows += roster.filter { $0.seatId != nil && matches($0.display) }.map { Option(name: $0.display, kind: .bound) }
        rows += roster.filter { $0.seatId == nil && matches($0.display) }.map { Option(name: $0.display, kind: .unbound) }
        rows += ["someone", "anyone"].filter { $0.hasPrefix(p) }.map { Option(name: $0, kind: .keyword) }
        let typingKeyword = rows.contains { $0.kind == .keyword }
        if !typingKeyword, partial.last?.isWhitespace != true, let name = normalizeName(partial), !name.contains(" ") {
            let k = key(name)
            let seats = (seatNames + [selfName].compactMap { $0 }).map(key)
            let taken = seats.contains { isNearName(k, seatKey: $0) } || roster.contains { key($0.display) == k }
            if !taken { rows.append(Option(name: name, kind: .add)) }
        }
        return rows
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
