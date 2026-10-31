import SwiftUI

/// "How tasks work" (handoff v2 §5): the four task types as cards on `RisoDialog`, kicker
/// `Welcome, {name}` / `Pool`, title `Four kinds of task`, one dark button. A scrim tap, the
/// VoiceOver escape gesture or the button closes it.
struct HowTasksWorkView: View {
    let entry: HowTasksWork.Entry
    let onClose: () -> Void

    var body: some View {
        RisoDialog(title: "Four kinds of task", kicker: HowTasksWork.kicker(entry), titleSize: 26, onClose: onClose) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(HowTasksWork.kinds) { KindCard(kind: $0) }
            }
            RisoButton(title: HowTasksWork.button(entry), kind: .dark, fullWidth: true, large: true, action: onClose)
                .accessibilityIdentifier("howto-close")
        }
        .accessibilityIdentifier("howto")
    }
}

/// One task type: the pill tag on the left (92pt column) beside "Seen by" and "Dealt to".
private struct KindCard: View {
    let kind: HowTasksWork.Kind

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            TaskKindTag(tag: kind.tag, title: kind.title)
                .frame(width: 92, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                fact("Seen by", kind.seen)
                fact("Dealt to", kind.dealt)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .risoCard(fill: .risoPaper)
        .risoHardShadow(Riso.Shadow.small)
        .accessibilityElement(children: .combine)
    }

    /// Small uppercase label, then the value in Archivo 13.5 ink (the *Name* placeholder italic 700).
    private func fact(_ label: String, _ parts: [HowTasksWork.Part]) -> some View {
        let value = parts.reduce(Text("")) { acc, part in
            acc + (part.emphasis ? Text(part.text).font(.risoBody(13.5, .bold)).italic() : Text(part.text).font(.risoBody(13.5)))
        }
        return (Text(label.uppercased()).font(.risoHead(11, .extraBold)).tracking(1.32).foregroundColor(.risoMuted)
                + Text("  ") + value.foregroundColor(.risoInk))
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The 24pt keylined pill naming a task type, in that type's fill.
struct TaskKindTag: View {
    let tag: HowTasksWork.Kind.Tag
    let title: String

    private var fill: Color {
        switch tag {
        case .plain: return .risoPaper2
        case .name: return .risoBlue
        case .someone: return .risoRed
        case .anyone: return .risoGold
        }
    }

    private var foreground: Color {
        switch tag {
        case .plain: return .risoInk
        case .name, .someone: return .risoOnColor
        case .anyone: return .risoInkStatic
        }
    }

    var body: some View {
        Text(title)
            .font(.risoHead(12, .extraBold))
            .foregroundStyle(foreground)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 9)
            .frame(height: 24)
            .background(Capsule().fill(fill))
            .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            .clipShape(Capsule())
    }
}
