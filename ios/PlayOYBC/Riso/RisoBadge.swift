import SwiftUI

/// Riso status badge (web `RisoBadge`) — the small uppercase pill. `.expiring` is the
/// gold "Host" tag. Coloured fills carry static cream, gold carries ink-static.
struct RisoBadge: View {
    enum Kind {
        case active, completed, draft, expiring, archived

        fileprivate var fill: Color {
            switch self {
            case .active: return .risoBlue
            case .completed: return .risoGreen
            case .draft: return .risoPaper
            case .expiring: return .risoGold
            case .archived: return .risoPaper2
            }
        }

        fileprivate var foreground: Color {
            switch self {
            case .active, .completed: return .risoOnColor
            case .draft, .archived: return .risoMuted
            case .expiring: return .risoInkStatic
            }
        }
    }

    let kind: Kind
    let title: String

    init(_ title: String, kind: Kind) {
        self.title = title
        self.kind = kind
    }

    var body: some View {
        Text(title)
            .font(.risoHead(11, .bold))
            .tracking(0.55)
            .textCase(.uppercase)
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(kind.foreground)
            .padding(.vertical, 4)
            .padding(.horizontal, 10)
            .background(Capsule().fill(kind.fill))
            .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            // Clip to the capsule: the stroke otherwise draws flat stubs past the curve
            // at the mid-height of short capsules.
            .clipShape(Capsule())
    }
}
