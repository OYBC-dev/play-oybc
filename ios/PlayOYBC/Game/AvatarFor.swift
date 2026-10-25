import SwiftUI

/// Avatar presentation for a lobby seat — the Swift twin of `web/src/game/avatars.ts`.
///
/// Rule (keep both platforms identical): `index` is the seat's join-order position
/// (0-based); the fill cycles red, blue, gold, green, paper-2 by `index % 5`. The initial
/// is the first character of the first whitespace-separated word of the name, uppercased;
/// an empty or whitespace-only name gives "?". Characters are grapheme clusters, so emoji
/// are never split.
/// Divergence: web takes the first code point instead, so a multi-scalar emoji (flag, skin
/// tone, ZWJ family) is one whole glyph here and only its first scalar on web.
enum AvatarFor {
    /// One fill slot of the cycle.
    enum Slot: CaseIterable {
        case red, blue, gold, green, paper2

        /// Circle fill.
        var fill: Color {
            switch self {
            case .red: return .risoRed
            case .blue: return .risoBlue
            case .gold: return .risoGold
            case .green: return .risoGreen
            case .paper2: return .risoPaper2
            }
        }

        /// Initial colour: ink-static on gold, adaptive ink on paper-2, static cream otherwise.
        var foreground: Color {
            switch self {
            case .gold: return .risoInkStatic
            case .paper2: return .risoInk
            default: return .risoOnColor
            }
        }
    }

    /// The fill slot for a join-order index (wraps, negative-safe).
    ///
    /// - Parameter index: Join-order index of the seat.
    /// - Returns: The slot in the red → blue → gold → green → paper-2 cycle.
    static func slot(index: Int) -> Slot {
        let all = Slot.allCases
        return all[((index % all.count) + all.count) % all.count]
    }

    /// The one-letter initial for a display name ("?" when blank).
    ///
    /// - Parameter name: The seat's display name.
    /// - Returns: A single uppercased character, or "?".
    static func initial(of name: String) -> String {
        guard let word = name.split(whereSeparator: \.isWhitespace).first, let ch = word.first else { return "?" }
        return String(ch).uppercased()
    }

    /// Derives a seat's avatar.
    ///
    /// - Parameters:
    ///   - seat: The seat.
    ///   - index: Join-order index of the seat.
    /// - Returns: The initial plus the fill and initial colours.
    static func make(seat: Seat, index: Int) -> (initial: String, fill: Color, foreground: Color) {
        make(name: seat.name, index: index)
    }

    /// Derives an avatar from a bare display name (same rule as `make(seat:index:)`).
    ///
    /// - Parameters:
    ///   - name: The display name.
    ///   - index: Join-order index.
    /// - Returns: The initial plus the fill and initial colours.
    static func make(name: String, index: Int) -> (initial: String, fill: Color, foreground: Color) {
        let s = slot(index: index)
        return (initial(of: name), s.fill, s.foreground)
    }
}
