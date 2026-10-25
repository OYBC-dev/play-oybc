import Foundation

/// Stand-in text for a pool row the client may not read — the Swift twin of
/// `web/src/pages/lobby/nonsense.ts`. Same syllables, hash and generator, so web and iOS
/// draw the same string (and length) for a given task id.
enum Nonsense {
    private static let syllables = ["ra", "ke", "no", "sti", "vel", "um", "tha", "pri", "lo", "zen",
                                    "qua", "mi", "dor", "fe", "sa", "wo", "bli", "tur", "os", "nye"]

    /// Shortest and longest string a hidden pool row renders.
    static let minLength = 18
    static let maxLength = 60

    /// 32-bit FNV-1a over UTF-16 code units (JS `charCodeAt`).
    static func hash(_ s: String) -> UInt32 {
        var h: UInt32 = 0x811c9dc5
        for unit in s.utf16 {
            h ^= UInt32(unit)
            h = h &* 0x01000193
        }
        return h
    }

    /// Seeded linear congruential generator in [0, 1).
    private struct Generator {
        var state: UInt32
        mutating func next() -> Double {
            state = state &* 1_664_525 &+ 1_013_904_223
            return Double(state) / 4_294_967_296
        }
    }

    /// Nonsense for a hidden task. The client never has the real text (or its length), so
    /// the length is pseudo-random but stable per task.
    ///
    /// - Parameter id: Id of the hidden task; the same id always gives the same string.
    /// - Returns: Lowercase syllable words, `minLength...maxLength` characters long.
    static func forTask(_ id: String) -> String {
        var rng = Generator(state: hash(id))
        let len = minLength + Int(rng.next() * Double(maxLength - minLength + 1))
        var out = ""
        while out.count < len {
            var word = ""
            let n = 1 + Int(rng.next() * 3)
            for _ in 0..<n { word += syllables[Int(rng.next() * Double(syllables.count))] }
            out += (out.isEmpty ? "" : " ") + word
        }
        // slice(0, len).trimEnd().padEnd(len, "r")
        var cut = String(out.prefix(len))
        while cut.last == " " { cut.removeLast() }
        return cut + String(repeating: "r", count: len - cut.count)
    }
}
