import SwiftUI

/// Stacked "<Name> got a bingo!" banners (web `BingoBanner`). `banners` is front-first: the
/// front one is tappable and rotated, the others sit behind it (+12 pt, -4.5% scale each).
/// A confetti burst plays per new banner; under Reduce Motion there is no confetti and
/// banners swap instantly. `animates: false` also suppresses motion (snapshots).
struct BingoBannerView: View {
    let banners: [BingoDoc]
    var animates = true
    /// Distance from the top of the layout area (web: 56; 60 here so the tilted front card never overlaps the dots button's bottom edge).
    var topInset: CGFloat = 60
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var announced: Set<Int> = []
    @State private var bursts: [Int] = []
    @State private var burstSeen: Set<Int> = []
    @State private var announcement: _Concurrency.Task<Void, Never>?

    private var motion: Bool { animates && !reduceMotion }

    var body: some View {
        // A full-size, hit-transparent layer so confetti can cover the screen while only
        // the cards take touches.
        Color.clear
            .overlay(alignment: .top) {
                ZStack(alignment: .top) {
                    ForEach(Array(banners.enumerated()).reversed(), id: \.element.seq) { index, bingo in
                        card(bingo, index: index)
                            .zIndex(Double(Self.maxZ - index))
                    }
                }
                .padding(.horizontal, Self.gutter)
                .padding(.top, topInset)
                .animation(motion ? .spring(response: 0.38, dampingFraction: 0.72) : nil, value: banners.map(\.seq))
            }
            .overlay { confetti }
        .onChange(of: banners.map(\.seq), initial: true) { _, _ in sync() }
        .onDisappear { announcement?.cancel() }
    }

    static let gutter: CGFloat = 14
    private static let maxZ = 10

    /// One view type for every position, keyed by the banner's seq, so a promoted card slides
    /// forward instead of re-inserting; only the front takes touches and VoiceOver focus.
    private func card(_ bingo: BingoDoc, index: Int) -> some View {
        Button(action: onDismiss) {
            BingoBannerCard(name: bingo.name)
                .rotationEffect(.degrees(index == 0 ? -1.2 : 0), anchor: .top)
                .scaleEffect(1 - Double(index) * 0.045, anchor: .top)
                .offset(y: CGFloat(index) * 12)
        }
        .buttonStyle(.plain)
        .allowsHitTesting(index == 0)
        .accessibilityHidden(index != 0)
        .accessibilityLabel("\(bingo.name) got a bingo!")
        .transition(motion ? .asymmetric(insertion: .offset(y: -110).combined(with: .opacity),
                                          removal: .offset(y: -190).combined(with: .opacity)) : .identity)
    }

    @ViewBuilder private var confetti: some View {
        if motion {
            ZStack {
                ForEach(bursts, id: \.self) { seq in
                    BingoConfettiView(seed: seq) { bursts.removeAll { $0 == seq } }
                }
            }
        }
    }

    /// Announces and bursts each banner once, however many arrive together.
    private func sync() {
        let fresh = banners.map(\.seq).filter { !announced.contains($0) }
        guard !fresh.isEmpty else { return }
        announced.formUnion(fresh)
        let names = banners.filter { fresh.contains($0.seq) }.map(\.name)
        if motion { for seq in fresh where !burstSeen.contains(seq) { bursts.append(seq) } }
        burstSeen.formUnion(fresh)
        // One combined announcement (web's single live region): overlapping ones are dropped.
        announcement?.cancel()
        let message = names.map { "\($0) got a bingo!" }.joined(separator: " ")
        announcement = _Concurrency.Task { @MainActor in
            guard !_Concurrency.Task.isCancelled else { return }
            AccessibilityNotification.Announcement(message).post()
        }
    }
}

/// The gold banner card: ink star tile + "<Name> got a bingo!" (ink-static on gold, 2 pt
/// keyline, `Riso.Shadow.banner` hard shadow).
struct BingoBannerCard: View {
    let name: String

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.risoInkStatic)
                .frame(width: 40, height: 40)
                .overlay(BannerStar().fill(Color.risoGold).frame(width: 22, height: 22))
                .accessibilityHidden(true)
            Text("\(name) got a bingo!")
                .font(.risoHead(24, .extraBold))
                .tracking(-0.48)
                .tightLines()
                .foregroundStyle(Color.risoInkStatic)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Riso.cardRadius).fill(Color.risoGold))
        .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Color.risoInkStatic, lineWidth: Riso.Keyline.container))
        .risoHardShadow(Riso.Shadow.banner)
        .contentShape(Rectangle())
    }
}

/// Web's 24-unit star glyph.
private struct BannerStar: Shape {
    func path(in rect: CGRect) -> Path {
        let pts: [(Double, Double)] = [(12, 2.5), (14.9, 8.5), (21.5, 9.4), (16.7, 14), (17.9, 20.5),
                                       (12, 17.4), (6.1, 20.5), (7.3, 14), (2.5, 9.4), (9.1, 8.5)]
        var p = Path()
        for (i, pt) in pts.enumerated() {
            let q = CGPoint(x: rect.minX + rect.width * pt.0 / 24, y: rect.minY + rect.height * pt.1 / 24)
            i == 0 ? p.move(to: q) : p.addLine(to: q)
        }
        p.closeSubpath()
        return p
    }
}

private extension View {
    /// Web's line-height 1.05 at 24 pt (25.2 pt); SwiftUI ignores a negative `lineSpacing`.
    @ViewBuilder func tightLines() -> some View {
        if #available(iOS 26, *) { lineHeight(.exact(points: 25.2)) } else { lineSpacing(-3) }
    }
}
