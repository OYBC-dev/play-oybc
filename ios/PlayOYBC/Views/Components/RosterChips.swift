import SwiftUI

extension Riso {
    /// The 2pt dashed ink keyline the lobby draws for "not here yet" (the waiting pill, unbound
    /// roster names): web `border: 2px dashed`.
    static let dashedKeyline = StrokeStyle(lineWidth: Keyline.container, dash: [6, 4])
}

/// A roster name nobody carries yet (web `PlayerList` unbound chip): 38pt, 14pt sides, Bricolage
/// 14/700 muted text, no fill, a 2pt dashed keyline — ink for the host, muted for a guest (whose
/// chip is not a button). Also the chips in the Launch confirm.
struct UnboundNameChip: View {
    let name: String
    /// Muted keyline: a guest's chip, which is not tappable.
    var muted = false

    var body: some View {
        Text(name)
            .font(.risoHead(14, .bold))
            .foregroundStyle(Color.risoMuted)
            .lineLimit(1)
            .padding(.horizontal, 14)
            .frame(height: 38)
            .overlay(Capsule().strokeBorder(muted ? Color.risoMuted : Color.risoInk, style: Riso.dashedKeyline))
            .fixedSize()
    }
}

/// A roster name bound to a player, as a small tag inside that player's pill (web `PlayerList`
/// bound tag): 22pt, 8pt sides, Bricolage 12/700, paper fill, a 1.5pt keyline — ink with ink text
/// for the host, muted with muted text for a guest.
struct BoundNameTag: View {
    let name: String
    var muted = false

    var body: some View {
        Text(name)
            .font(.risoHead(12, .bold))
            .foregroundStyle(muted ? Color.risoMuted : Color.risoInk)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .frame(height: 22)
            .background(Capsule().fill(Color.risoPaper))
            .overlay(Capsule().strokeBorder(muted ? Color.risoMuted : Color.risoInk, lineWidth: 1.5))
            // Clip to the capsule: short capsule strokes draw flat stubs at their ends.
            .clipShape(Capsule())
            .fixedSize()
    }
}

// MARK: - Collapse-out transition

extension AnyTransition {
    /// A chip leaving the list: its width and opacity run to 0 (the neighbours close the gap),
    /// then it is removed. Insertion is immediate. The caller picks the animation (180 ms, none
    /// under Reduce Motion).
    static var collapseWidth: AnyTransition {
        .asymmetric(insertion: .identity,
                    removal: .modifier(active: CollapseWidthModifier(factor: 0), identity: CollapseWidthModifier(factor: 1)))
    }
}

/// Scales a view's laid-out width by `factor` and fades it by the same amount.
struct CollapseWidthModifier: ViewModifier, Animatable {
    var factor: CGFloat
    var animatableData: CGFloat {
        get { factor }
        set { factor = newValue }
    }

    func body(content: Content) -> some View {
        CollapseWidthLayout(factor: factor) { content }
            .opacity(Double(factor))
            // Only clip while collapsing, so the resting chip keeps its hit slop.
            .clipShape(CollapseClip(collapsing: factor < 1))
    }
}

/// Reports `factor` × the child's ideal width; the child keeps its full size, pinned leading.
private struct CollapseWidthLayout: Layout {
    var factor: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let size = subviews.first?.sizeThatFits(.unspecified) ?? .zero
        return CGSize(width: size.width * max(0, min(1, factor)), height: size.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: .unspecified)
    }
}

/// The view's bounds while collapsing; unbounded at rest.
private struct CollapseClip: Shape {
    let collapsing: Bool
    func path(in rect: CGRect) -> Path {
        Path(collapsing ? rect : rect.insetBy(dx: -1000, dy: -1000))
    }
}

// MARK: - Mention autocomplete leading slot

/// The 22pt slot ahead of an autocomplete row's name (web `MentionAutocomplete`): a solid avatar
/// for a player, and for a bound name its player's avatar; a dashed hollow circle for an unbound
/// name; nothing for someone / anyone; a blue plus for the add row.
struct MentionLeading: View {
    let kind: Mentions.Kind
    /// The seat whose avatar a player / bound row wears, with its join-order index.
    var avatar: (name: String, index: Int)?

    var body: some View {
        Group {
            switch kind {
            case .player, .bound:
                if let avatar {
                    let a = AvatarFor.make(name: avatar.name, index: avatar.index)
                    Text(a.initial)
                        .font(.risoHead(10, .extraBold))
                        .foregroundStyle(a.foreground)
                        .lineLimit(1)
                        .frame(width: 22, height: 22)
                        .background(Circle().fill(a.fill))
                        .overlay(Circle().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
                } else {
                    Color.clear
                }
            case .unbound:
                Circle().strokeBorder(Color.risoInk, style: Riso.dashedKeyline)
            case .keyword:
                Color.clear
            case .add:
                PlusGlyph()
                    .stroke(Color.risoBlue, style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
                    .frame(width: 18, height: 18)
            }
        }
        .frame(width: 22, height: 22)
        .accessibilityHidden(true)
    }
}

/// The kit's stroke plus (24-unit grid, arms 5…19).
private struct PlusGlyph: Shape {
    func path(in rect: CGRect) -> Path {
        let u = rect.width / 24
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + 12 * u, y: rect.minY + 5 * u))
        p.addLine(to: CGPoint(x: rect.minX + 12 * u, y: rect.minY + 19 * u))
        p.move(to: CGPoint(x: rect.minX + 5 * u, y: rect.minY + 12 * u))
        p.addLine(to: CGPoint(x: rect.minX + 19 * u, y: rect.minY + 12 * u))
        return p
    }
}
