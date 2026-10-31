import SwiftUI

/// The shared pool in one card (web `PoolList`). Rows that mention you arrive without text
/// and render as blurred nonsense; your own rows and (for the host) every row can be deleted.
struct PoolListView: View {
    let entries: [PoolViewEntry]
    let isHost: Bool
    /// Task ids with a delete in flight.
    var deleting: Set<String> = []
    let onDelete: (String) -> Void

    var body: some View {
        if entries.isEmpty {
            VStack(spacing: 12) {
                RisoMiniBoardArt(cellSize: 20)
                Text("No tasks yet").font(.risoHead(15, .bold)).foregroundStyle(Color.risoMuted)
            }
            .padding(.top, 30)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity)
            .risoCard()
            .risoHardShadow(Riso.Shadow.card)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(entries.enumerated()), id: \.element.taskId) { i, e in
                    if i > 0 { Rectangle().fill(Color.risoHair).frame(height: 1).padding(.horizontal, 14) }
                    row(e)
                }
            }
            .padding(.vertical, 4)
            .risoCard()
            .risoHardShadow(Riso.Shadow.card)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Pool")
        }
    }

    private func row(_ e: PoolViewEntry) -> some View {
        let canDelete = e.mine || isHost
        return HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                if let text = e.text {
                    Text(MentionText.attributed(text, refs: e.refs, font: .risoBody(15, .medium), boldFont: .risoBody(15, .extraBold)))
                        .accessibilityLabel(text)
                        .lineSpacing(3)
                        .foregroundStyle(Color.risoInk)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    BlurredText(taskId: e.taskId)
                }
                Text(e.mine ? "You" : e.authorName)
                    .font(.risoHead(11, .bold))
                    .tracking(1.32)
                    .textCase(.uppercase)
                    .foregroundStyle(Color.risoMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if canDelete {
                Button { onDelete(e.taskId) } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(Color.risoMuted)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(e.text.map { "Delete task: \($0)" } ?? "Delete hidden task by \(e.authorName)")
                .disabled(deleting.contains(e.taskId))
                .opacity(deleting.contains(e.taskId) ? 0.4 : 1)
            }
        }
        .padding(.vertical, 11)
        .padding(.leading, 14)
        .padding(.trailing, canDelete ? 6 : 14)
        .frame(minHeight: 56)
    }
}

/// A task you can't read: two mis-registered, blurred copies of per-task nonsense (web
/// `BlurredText`). The client never has the hidden text; VoiceOver hears "Hidden task".
struct BlurredText: View {
    let taskId: String
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let fake = Nonsense.forTask(taskId)
        // The copies hang off an overlay so their natural (unwrapped) width never sizes the row.
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: 20)
            .overlay(alignment: .leading) {
                ZStack(alignment: .leading) {
                    copy(fake, color: .risoRed)
                        .blur(radius: 3)
                        .scaleEffect(x: 1.04, y: 1, anchor: .leading)
                        .offset(x: 1.5)
                    copy(fake, color: .risoBlue)
                        .blur(radius: 2.4)
                        .offset(x: -1, y: 0.5)
                        .blendMode(scheme == .dark ? .screen : .multiply)
                }
            }
            .clipped()
        .accessibilityElement()
        .accessibilityLabel("Hidden task")
        .accessibilityAddTraits(.isImage)
    }

    private func copy(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.risoHead(15, .bold))
            .foregroundStyle(color)
            .opacity(0.9)
            .lineLimit(1)
            .fixedSize()
    }
}
