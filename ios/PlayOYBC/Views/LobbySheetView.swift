import SwiftUI
import UIKit

/// The lobby's bottom sheet (web `LobbySheet`, handoff v2 §2–§4), with two resting heights.
///
/// Collapsed — host: the game code, red shortfall lines (or "{mine} / {needed}"), a 64pt QR tile
/// that expands the sheet, and Launch. Player: the code, the count, Copy link and, once the pool is
/// ready, a mini "Waiting for host" pill.
///
/// Expanded (drag the handle up, tap it, or tap the QR tile; drag down, tap the handle, the scrim or
/// VoiceOver escape collapse): a scrolling region with the big QR + share, the readiness summary and
/// the players, over a pinned footer — the host's Launch, or the player's waiting pill. At most
/// `maxHeight` tall; a 28pt fade marks content past the bottom.
///
/// Ready (nobody short) turns the sheet olive with on-colour text for host and player alike.
/// Drawn to the screen's bottom edge; `bottomInset` is the home-indicator safe area so the content
/// clears it with `bottomClearance` from the edge.
struct LobbySheetView: View {
    let snapshot: GameSnapshot
    let isHost: Bool
    /// Home-indicator safe-area height under the sheet.
    var bottomInset: CGFloat = 0
    /// Which resting height the sheet is at (the lobby owns it for the scrim).
    @Binding var expanded: Bool
    /// The tallest the expanded sheet gets: min(66% of the screen, 620).
    var maxHeight: CGFloat = 620
    /// Host: Launch tapped (the lobby asks first when unbound roster names remain).
    let onLaunch: () -> Void
    /// The launch call is in flight (Launch is disabled).
    var launchBusy = false
    /// Copy for the last failed launch.
    var launchError: String?
    /// False freezes the waiting dots (snapshots).
    var animateWaiting = true
    @GestureState private var drag: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Content-to-screen-edge padding on a home-indicator iPhone (the iOS frames' 38pt).
    static let bottomClearance: CGFloat = 38
    /// Gap between shortfall lines, within a wrapped line and between lines alike.
    static let shortfallLeading: CGFloat = 2
    /// The handoff's expand / collapse spring: 340 ms, cubic-bezier(0.34, 1.3, 0.64, 1).
    static let spring = Animation.timingCurve(0.34, 1.3, 0.64, 1, duration: 0.34)
    /// Three shortfall lines show; more scroll inside the sheet (web `.shorts`). Follows
    /// Dynamic Type through the same scaling as `Font.risoBody`.
    @ScaledMetric(relativeTo: .body) private var shortfallLine: CGFloat = 12.5
    private var shortfallCap: CGFloat {
        let font = UIFont(name: "Archivo-Bold", size: shortfallLine) ?? .systemFont(ofSize: shortfallLine, weight: .bold)
        // Every line box sits one line height apart with the same gap, wrapped or not.
        return 3 * font.lineHeight + 2 * Self.shortfallLeading
    }

    private var readiness: LobbyReadiness { LobbyReadiness(snapshot: snapshot) }
    private var lines: [String] { isHost ? LobbyLogic.shortfallLines(game: snapshot.game, seats: snapshot.seats) : [] }
    private var ready: Bool { readiness.ready }
    private var canLaunch: Bool { LobbyLogic.canLaunch(game: snapshot.game, seats: snapshot.seats, isHost: isHost) }
    private var link: String { GameConstants.joinLink(code: snapshot.game.code) }
    private var fg: Color { ready ? .risoOnColor : .risoInk }
    private var muted: Color { ready ? .risoOnColor : .risoMuted }
    private var hair: Color { ready ? Color.risoOnColor.opacity(0.25) : .risoHair }
    private var sheetFill: Color { ready ? .risoBlue : .risoPaper2 }

    var body: some View {
        ClampHeightLayout(max: expanded ? maxHeight : .infinity) {
            VStack(alignment: .leading, spacing: 12) {
                handle
                if expanded {
                    FadedScrollRegion(fade: sheetFill) { expandedContent }
                        .transition(.opacity)
                    expandedFooter
                } else {
                    collapsedFooter
                }
                if let launchError {
                    Text(launchError)
                        .font(.risoBody(13, .semibold))
                        .foregroundStyle(ready ? Color.risoOnColor : Color.risoDanger)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, Riso.gutter)
            .padding(.top, 10)
            .padding(.bottom, max(Self.bottomClearance, bottomInset + 4))
        }
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity)
        .background(sheetShape)
        .offset(y: drag)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: ready)
        .animation(reduceMotion ? nil : Self.spring, value: expanded)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(expanded ? .isModal : [])
        .accessibilityAction(.escape) { if expanded { setExpanded(false) } }
        .accessibilityIdentifier("lobby-sheet")
    }

    // MARK: Chrome

    /// The 40×5 grabber; drag or tap it to move between the two heights. Its hit area spills past
    /// the drawn capsule without moving the layout.
    private var handle: some View {
        Capsule()
            .fill(fg.opacity(0.35))
            .frame(width: 40, height: 5)
            .frame(maxWidth: .infinity)
            .risoHitSlop(12)
            .gesture(dragGesture)
            .onTapGesture { setExpanded(!expanded) }
            .accessibilityElement()
            .accessibilityLabel(expanded ? "Hide game details" : "Show game details")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { setExpanded(!expanded) }
            .accessibilityIdentifier("sheet-handle")
    }

    /// Expanded, the sheet follows a downward drag; either way a short flick settles it on the other height.
    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .global)
            .updating($drag) { value, state, _ in
                state = expanded ? max(0, value.translation.height) : 0
            }
            .onEnded { value in
                let dy = value.translation.height, flung = value.predictedEndTranslation.height
                if expanded, dy > 60 || flung > 180 { setExpanded(false) }
                if !expanded, dy < -24 || flung < -120 { setExpanded(true) }
            }
    }

    private func setExpanded(_ on: Bool) {
        guard on != expanded else { return }
        expanded = on
    }

    /// Paper-2 (olive when ready) with a 22pt top radius and a 2pt ink top keyline; the
    /// side and bottom keylines sit just past the screen edges.
    private var sheetShape: some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22)
        return shape.fill(sheetFill)
            .overlay(shape.strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            .padding(.horizontal, -Riso.Keyline.container)
            .padding(.bottom, -Riso.Keyline.container)
    }

    // MARK: Collapsed

    private var collapsedFooter: some View {
        HStack(alignment: .center, spacing: 14) {
            info.frame(maxWidth: .infinity, alignment: .leading)
            if isHost {
                Button { setExpanded(true) } label: { QRTile(link: link, side: 64, pad: 3) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Share")
                    .accessibilityIdentifier("qr-tile")
                RisoButton(title: "Launch", kind: ready ? .dark : .primary, large: true, action: onLaunch)
                    .risoDisabled(!canLaunch || launchBusy)
            } else {
                VStack(alignment: .center, spacing: 8) {
                    CopyLinkButton(link: link, small: true)
                        .risoHitSlop(6)
                    if readiness.showsPlayerWaitingMini {
                        WaitingPill(title: "Waiting for host", style: .mini, animated: animateWaiting, tone: .onColor)
                    }
                }
                .fixedSize()
            }
        }
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Game code").risoSectionLabel(muted).accessibilityAddTraits(.isHeader)
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
            } else {
                Text(LobbyLogic.poolCount(game: snapshot.game, mySeatId: snapshot.mySeatId))
                    .font(.risoBody(12.5, .bold))
                    .foregroundStyle(muted)
            }
        }
    }

    // MARK: Expanded

    private var expandedContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            shareBlock
            summaryBlock
            playersBlock
        }
        .padding(.bottom, 4)  // room for the hard shadows at the end of the scroll
        .padding(.trailing, 3)
    }

    /// a. The big QR on the static cream tile, the code, the join link, Copy link and Share.
    private var shareBlock: some View {
        HStack(alignment: .center, spacing: 16) {
            QRTile(link: link, side: 128, radius: Riso.cardRadius, shadow: Riso.Shadow.button)
                .accessibilityLabel("QR code")
            VStack(alignment: .leading, spacing: 8) {
                Text("Game code").risoSectionLabel(muted).accessibilityAddTraits(.isHeader)
                GameCodeText(code: snapshot.game.code, color: fg, size: 38)
                Text(link)
                    .font(.risoBody(12.5))
                    .foregroundStyle(muted)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                HStack(spacing: 8) {
                    CopyLinkButton(link: link, fullWidth: true, small: true, minHeight: 40, horizontalPadding: 8)
                    if let url = URL(string: link) {
                        ShareLink(item: url) {
                            RisoButtonLabel(title: "Share", systemImage: "square.and.arrow.up", fullWidth: true, small: true,
                                            minHeight: 40, horizontalPadding: 8)
                        }
                        .buttonStyle(RisoButtonStyle())
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.top, 2)
    }

    /// b. `{have} of {target} in the pool` · status, the bar, and the short-player lines.
    private var summaryBlock: some View {
        let r = readiness
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(r.label).font(.risoHead(15, .extraBold)).foregroundStyle(fg)
                Spacer(minLength: 0)
                Text(r.status).font(.risoBody(12.5, .bold)).foregroundStyle(muted)
            }
            .accessibilityElement(children: .combine)
            RisoProgressBar(value: r.progress, color: ready ? .risoOnColor : .risoBlue, track: .risoPaper2)
                .accessibilityHidden(true)
            ForEach(r.lines, id: \.self) { line in
                Text(line.text)
                    .font(.risoBody(12.5, .bold))
                    .lineSpacing(2)
                    .foregroundStyle(line.danger ? Color.risoDanger : fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityIdentifier("readiness")
    }

    /// c. `Players · N`: short players first, each `{dealable} / {tasksPerBoard}` (`· n more` in red);
    /// one avatar-stack row once everyone is set.
    private var playersBlock: some View {
        let r = readiness
        return VStack(alignment: .leading, spacing: 0) {
            Text("Players · \(r.players.count)").risoSectionLabel(muted).padding(.bottom, 4).accessibilityAddTraits(.isHeader)
            if r.ready {
                HStack(spacing: 12) {
                    SheetAvatarStack(players: r.players)
                    Text(r.allSetLabel).font(.risoBody(15, .semibold)).foregroundStyle(fg)
                    Spacer(minLength: 0)
                    Text("\(r.target) / \(r.target)").font(.risoHead(13, .extraBold)).foregroundStyle(fg)
                }
                .frame(minHeight: 48)
                .accessibilityElement(children: .combine)
            } else {
                ForEach(Array(r.players.enumerated()), id: \.element.id) { i, row in
                    playerRow(row, count: r.count(for: row))
                        .overlay(alignment: .top) {
                            if i > 0 { Rectangle().fill(hair).frame(height: 1).accessibilityHidden(true) }
                        }
                }
            }
        }
        .accessibilityIdentifier("sheet-players")
    }

    private func playerRow(_ row: LobbyReadiness.PlayerRow, count: String) -> some View {
        HStack(spacing: 12) {
            AvatarView(name: row.name, index: row.index, diameter: 32)
            HStack(spacing: 8) {
                Text(row.name).font(.risoBody(15, .semibold)).foregroundStyle(fg).lineLimit(1)
                if row.isHost { RisoBadge("Host", kind: .expiring) }
            }
            Spacer(minLength: 8)
            (Text(count).foregroundColor(fg)
             + (row.need > 0 ? Text(" · \(row.need) more").foregroundColor(.risoDanger) : Text("")))
                .font(.risoHead(13, .extraBold))
                .lineLimit(1)
                .fixedSize()
        }
        .frame(minHeight: 48)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var expandedFooter: some View {
        if isHost {
            RisoButton(title: readiness.launchLabel, kind: ready ? .dark : .primary, fullWidth: true, large: true,
                       action: onLaunch)
                .risoDisabled(!canLaunch || launchBusy)
                .accessibilityIdentifier("launch")
        } else {
            WaitingPill(title: readiness.playerFooter, style: .footer, animated: animateWaiting,
                        tone: ready ? .onColor : .danger, dots: ready)
                .accessibilityIdentifier("player-footer")
        }
    }
}

/// Up to four overlapping 30pt avatars, else three and a "+N" bubble (the ready players row; not a button).
private struct SheetAvatarStack: View {
    let players: [LobbyReadiness.PlayerRow]

    var body: some View {
        let byJoin = players.sorted { $0.index < $1.index }
        let shown = byJoin.count > 4 ? Array(byJoin.prefix(3)) : byJoin
        HStack(spacing: -8) {
            ForEach(shown) { AvatarView(name: $0.name, index: $0.index) }
            if byJoin.count > shown.count {
                AvatarCircle(fill: .risoPaper2) { Text("+\(byJoin.count - shown.count)").foregroundStyle(Color.risoInk) }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Proposes its child at most `max` tall and takes the child's own height (a `.frame(maxHeight:)`
/// would grow to the cap even when the content is shorter).
private struct ClampHeightLayout: Layout {
    let max: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let h = proposal.height.map { Swift.min($0, max) } ?? (max.isFinite ? max : nil)
        let size = child.sizeThatFits(ProposedViewSize(width: proposal.width, height: h))
        return CGSize(width: size.width, height: Swift.min(size.height, max))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
    }
}

/// A vertical scroll view sized to its content within whatever height its parent leaves it; when the
/// content runs past that, a 28pt fade into `fade` sits over the bottom edge.
private struct FadedScrollRegion<Content: View>: View {
    let fade: Color
    @ViewBuilder let content: Content

    var body: some View {
        ScrollFadeLayout {
            ScrollView { content }
                .scrollBounceBehavior(.basedOnSize)
            LinearGradient(colors: [fade.opacity(0), fade], startPoint: .top, endPoint: .bottom)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

/// Places a scroll view at its ideal height clamped to the proposal, and its second child (the fade)
/// as a 28pt strip along the bottom only when the content overflows.
private struct ScrollFadeLayout: Layout {
    static let fadeHeight: CGFloat = 28

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let scroll = subviews.first else { return .zero }
        let ideal = scroll.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil))
        let cap = proposal.height ?? .infinity
        return CGSize(width: proposal.width ?? ideal.width, height: min(ideal.height, cap))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let scroll = subviews.first else { return }
        scroll.place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
        guard subviews.count > 1 else { return }
        let ideal = scroll.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
        let h = ideal.height > bounds.height + 0.5 ? Self.fadeHeight : 0
        subviews[1].place(at: CGPoint(x: bounds.minX, y: bounds.maxY - h),
                          proposal: ProposedViewSize(width: bounds.width, height: h))
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
