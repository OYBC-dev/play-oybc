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

    /// Names offered for a partial: other players by case-insensitive prefix, then someone / anyone.
    static func options(partial: String, seatNames: [String]) -> [String] {
        let p = partial.lowercased()
        let names = seatNames.filter { $0.lowercased().hasPrefix(p) }
        return names + ["someone", "anyone"].filter { $0.hasPrefix(p) }
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
