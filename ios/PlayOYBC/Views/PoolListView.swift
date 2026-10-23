import SwiftUI

/// The shared pool (web `PoolList`). Entries that mention you arrive with no text and render
/// as a redacted bar; your own entries and (for the host) every entry can be deleted.
struct PoolListView: View {
    let entries: [PoolViewEntry]
    let isHost: Bool
    /// Task ids with a delete in flight.
    var deleting: Set<String> = []
    let onDelete: (String) -> Void

    var body: some View {
        VStack(spacing: 8) {
            ForEach(entries, id: \.taskId) { e in
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 4) {
                        if let text = e.text {
                            Text(text).font(.risoBody(15, .semibold)).foregroundStyle(Color.risoInk)
                                .fixedSize(horizontal: false, vertical: true)
                        } else {
                            RedactedBar().accessibilityLabel("Hidden task")
                        }
                        Text(e.mine ? "You" : e.authorName).font(.risoBody(12, .bold)).foregroundStyle(Color.risoMuted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if e.mine || isHost {
                        Button { onDelete(e.taskId) } label: {
                            Text("×").font(.risoBody(24, .regular)).foregroundStyle(Color.risoInk)
                                .frame(width: 44, height: 44)
                                .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Color.risoInk, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(e.text.map { "Delete task: \($0)" } ?? "Delete hidden task by \(e.authorName)")
                        .risoDisabled(deleting.contains(e.taskId))
                    }
                }
                .padding(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 8))
                .frame(minHeight: 44)
                .risoCard()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Pool")
    }
}

/// A task you can't read: ink bar under a gold halftone (web `.redacted`). Carries no text.
struct RedactedBar: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width * 0.7
            Canvas { ctx, size in
                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.risoInkStatic))
                let step: CGFloat = 6
                var y: CGFloat = step / 2
                while y < size.height {
                    var x: CGFloat = step / 2
                    while x < size.width {
                        ctx.fill(Path(ellipseIn: CGRect(x: x - 1.3, y: y - 1.3, width: 2.6, height: 2.6)), with: .color(.risoGold))
                        x += step
                    }
                    y += step
                }
            }
            .frame(width: w, height: 18)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.risoInk, lineWidth: 2))
        }
        .frame(height: 18)
        .accessibilityElement()
    }
}
