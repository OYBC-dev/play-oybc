import SwiftUI

/// Play OYBC brand mark (web `PlayBrandMark`): three fanned square cards from one pivot —
/// back-left blue −17°, back-right gold +17°, front red with a 3×3 grid of cream diagonal
/// cells and a gold centre. Each card is a 2-unit ink keyline with a 2-unit hard shadow.
///
/// The geometry is the web SVG's, in its own viewBox units, scaled uniformly into the
/// frame (SVG `xMidYMid meet`), so both platforms draw the same mark.
struct PlayBrandMark: View {
    /// Rendered size: `.header` is 44×34, `.home` is 110×85.
    enum Size {
        case header
        case home

        /// Viewbox geometry, verbatim from `web/src/components/riso/PlayBrandMark.tsx`.
        fileprivate var geo: Geo {
            switch self {
            case .header: return Geo(w: 44, h: 34, vw: 60, vh: 46, card: 33, x: 13, y: 6, r: 5, pad: 4, gap: 1)
            case .home: return Geo(w: 110, h: 85, vw: 143, vh: 110, card: 79, x: 32, y: 13, r: 12, pad: 10, gap: 2)
            }
        }
    }

    let size: Size

    /// 3×3 grid pattern: 1 = cream diagonal, 2 = gold centre, 0 = faint cream.
    private static let grid = [1, 0, 1, 0, 2, 0, 1, 0, 1]

    var body: some View {
        let g = size.geo
        let scale = min(g.w / g.vw, g.h / g.vh)
        ZStack(alignment: .topLeading) {
            card(g, fill: .risoBlue, angle: -17)
            card(g, fill: .risoGold, angle: 17)
            card(g, fill: .risoRed, angle: 0)
            gridCells(g)
        }
        .frame(width: g.vw, height: g.vh, alignment: .topLeading)
        .scaleEffect(scale)
        .frame(width: g.w, height: g.h)
        .accessibilityElement()
        .accessibilityLabel("Play OYBC")
        .accessibilityAddTraits(.isImage)
    }

    /// One fanned card: shadow, ink keyline, inset fill — rotated about (50%, 120%).
    private func card(_ g: Geo, fill: Color, angle: Double) -> some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: g.r)
                .fill(Color.risoShadowInk)
                .frame(width: g.card, height: g.card)
                .offset(x: 2, y: 2)
            RoundedRectangle(cornerRadius: g.r)
                .fill(Color.risoInk)
                .frame(width: g.card, height: g.card)
            RoundedRectangle(cornerRadius: max(g.r - 2, 1))
                .fill(fill)
                .frame(width: g.card - 4, height: g.card - 4)
                .offset(x: 2, y: 2)
        }
        .frame(width: g.card, height: g.card, alignment: .topLeading)
        .rotationEffect(.degrees(angle), anchor: UnitPoint(x: 0.5, y: 1.2))
        .offset(x: g.x, y: g.y)
    }

    /// The front card's 3×3 grid, unrotated.
    private func gridCells(_ g: Geo) -> some View {
        let inner = g.card - 4 - g.pad * 2
        let cell = (inner - g.gap * 2) / 3
        let x0 = g.x + 2 + g.pad
        let y0 = g.y + 2 + g.pad
        return ZStack(alignment: .topLeading) {
            ForEach(0..<9, id: \.self) { i in
                let v = Self.grid[i]
                RoundedRectangle(cornerRadius: 1)
                    .fill(v == 2 ? Color.risoGold : Color.risoOnColor)
                    .opacity(v == 0 ? 0.3 : 1)
                    .frame(width: cell, height: cell)
                    .offset(x: x0 + CGFloat(i % 3) * (cell + g.gap), y: y0 + CGFloat(i / 3) * (cell + g.gap))
            }
        }
    }
}

/// Viewbox geometry for one mark size (all values in viewBox units except `w`/`h`).
private struct Geo {
    let w: CGFloat, h: CGFloat, vw: CGFloat, vh: CGFloat
    let card: CGFloat, x: CGFloat, y: CGFloat, r: CGFloat, pad: CGFloat, gap: CGFloat
}
