import SwiftUI
import UIKit

/// The lobby's bottom sheet (web `LobbySheet`): the game code and, for the host, red
/// shortfall lines, a QR tile that opens the share sheet, and Launch. Ready (nobody short,
/// pool ≥ 24) turns it olive with a `dark` Launch. Players get the code and Copy link.
///
/// Drawn to the screen's bottom edge; `bottomInset` is the home-indicator safe area so the
/// content clears it with `bottomClearance` from the edge.
struct LobbySheetView: View {
    let snapshot: GameSnapshot
    let isHost: Bool
    /// Home-indicator safe-area height under the sheet.
    var bottomInset: CGFloat = 0
    let onLaunch: () async throws -> Void
    @State var qrOpen = false
    @State var busy = false
    @State var error: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Content-to-screen-edge padding on a home-indicator iPhone (the iOS frames' 38pt).
    static let bottomClearance: CGFloat = 38
    /// Gap between shortfall lines, within a wrapped line and between lines alike.
    static let shortfallLeading: CGFloat = 2
    /// Three shortfall lines show; more scroll inside the sheet (web `.shorts`). Follows
    /// Dynamic Type through the same scaling as `Font.risoBody`.
    @ScaledMetric(relativeTo: .body) private var shortfallLine: CGFloat = 12.5
    private var shortfallCap: CGFloat {
        let font = UIFont(name: "Archivo-Bold", size: shortfallLine) ?? .systemFont(ofSize: shortfallLine, weight: .bold)
        // Every line box sits one line height apart with the same gap, wrapped or not.
        return 3 * font.lineHeight + 2 * Self.shortfallLeading
    }

    private var lines: [String] { isHost ? LobbyLogic.shortfallLines(game: snapshot.game, seats: snapshot.seats) : [] }
    private var pool: Int { snapshot.view.count }
    private var ready: Bool { isHost && lines.isEmpty && pool >= GameConstants.minPoolSize }
    private var link: String { GameConstants.joinLink(code: snapshot.game.code) }
    private var fg: Color { ready ? .risoOnColor : .risoInk }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Capsule()
                .fill(fg.opacity(0.35))
                .frame(width: 40, height: 5)
                .frame(maxWidth: .infinity)
                .accessibilityHidden(true)
            HStack(alignment: .center, spacing: 14) {
                info.frame(maxWidth: .infinity, alignment: .leading)
                if isHost {
                    Button { qrOpen = true } label: { QRTile(link: link, side: 64, pad: 3) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Share")
                    RisoButton(title: "Launch", kind: ready ? .dark : .primary, large: true) { launch() }
                        .risoDisabled(!ready || busy)
                } else {
                    CopyLinkButton(link: link, small: true)
                        .risoHitSlop(6)
                }
            }
            if let error {
                Text(error)
                    .font(.risoBody(13, .semibold))
                    .foregroundStyle(ready ? Color.risoOnColor : Color.risoDanger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, Riso.gutter)
        .padding(.top, 10)
        .padding(.bottom, max(Self.bottomClearance, bottomInset + 4))
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity)
        .background(sheetShape)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: ready)
        .accessibilityIdentifier("lobby-sheet")
        .sheet(isPresented: $qrOpen) {
            ShareSheetView(code: snapshot.game.code) { qrOpen = false }
        }
    }

    /// Paper-2 (olive when ready) with a 22pt top radius and a 2pt ink top keyline; the
    /// side and bottom keylines sit just past the screen edges.
    private var sheetShape: some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22)
        return shape.fill(ready ? Color.risoBlue : Color.risoPaper2)
            .overlay(shape.strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            .padding(.horizontal, -Riso.Keyline.container)
            .padding(.bottom, -Riso.Keyline.container)
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Game code").risoSectionLabel(ready ? .risoOnColor : .risoMuted).accessibilityAddTraits(.isHeader)
            GameCodeText(code: snapshot.game.code, color: fg)
            if !lines.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: Self.shortfallLeading) {
                        ForEach(lines, id: \.self) { line in
                            Text(line)
                                .font(.risoBody(12.5, .bold))
                                .lineSpacing(Self.shortfallLeading)
                                .foregroundStyle(Color.risoDanger)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .scrollBounceBehavior(.basedOnSize)
                .modifier(CappedHeight(cap: shortfallCap))
                .accessibilityIdentifier("shortfalls")
            } else if isHost && !ready {
                Text("\(pool) / \(GameConstants.minPoolSize)")
                    .font(.risoBody(12.5, .bold))
                    .foregroundStyle(Color.risoMuted)
            }
        }
    }

    private func launch() {
        busy = true
        error = nil
        _Concurrency.Task {
            do { try await onLaunch() } catch { self.error = ErrorMessages.message(for: error) }
            busy = false
        }
    }
}

/// Sizes a vertical scroll view to its content, up to `cap`; past that it scrolls.
private struct CappedHeight: ViewModifier {
    let cap: CGFloat
    func body(content: Content) -> some View {
        CappedHeightLayout(cap: cap) { content }
    }
}

/// Proposes the child its ideal (content) height, clamped to `cap`.
private struct CappedHeightLayout: Layout {
    let cap: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let ideal = child.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil))
        return CGSize(width: proposal.width ?? ideal.width, height: min(ideal.height, cap))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
    }
}
