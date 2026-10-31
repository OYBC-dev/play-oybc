import SwiftUI

/// Task text with its mentioned names in bold (spec §4 "Task text").
enum MentionText {
    /// `text` in `font`, with each UTF-16 `[start, end)` range of `refs` in `boldFont`. Malformed or
    /// out-of-range pairs, and ranges that split a surrogate pair, are ignored.
    static func attributed(_ text: String, refs: [[Int]], font: Font, boldFont: Font) -> AttributedString {
        var out = AttributedString(text)
        out.font = font
        let utf16 = text.utf16
        for pair in refs {
            guard pair.count == 2, pair[0] >= 0, pair[0] < pair[1], pair[1] <= utf16.count else { continue }
            let lo16 = utf16.index(utf16.startIndex, offsetBy: pair[0])
            let hi16 = utf16.index(utf16.startIndex, offsetBy: pair[1])
            guard let lo = lo16.samePosition(in: text.unicodeScalars), let hi = hi16.samePosition(in: text.unicodeScalars),
                  let alo = AttributedString.Index(lo, within: out), let ahi = AttributedString.Index(hi, within: out)
            else { continue }
            out[alo..<ahi].font = boldFont
        }
        return out
    }
}
