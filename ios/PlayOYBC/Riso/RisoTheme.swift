import SwiftUI

/// Riso design-system tokens (harvest colorway) — the SwiftUI counterpart of
/// `web/src/styles/riso.css`.
///
/// Colors live in `Resources/Assets.xcassets` with light and dark
/// appearances, so they flip automatically with the system color scheme.
/// Fonts are the static weights bundled under `Resources/Fonts` and
/// registered via `UIAppFonts` in `project.yml`.
///
/// Numeric tokens (radii, keyline widths, hard-shadow offsets, spacing)
/// mirror the CSS `:root` vars. Reach for the semantic helpers
/// (`.risoCard()`, `RisoButton`, `Color.risoInk`, `Font.risoHead`) rather
/// than re-deriving these values per screen.
enum Riso {
    // Corner radii
    static let cardRadius: CGFloat = 8   // --r-card: cards, inputs, buttons
    static let cellRadius: CGFloat = 7   // --r-cell: board cells
    static let pill: CGFloat = 999       // chips / pills

    // Keyline widths (2pt everywhere: cards, inputs, chips, cells, code pill)
    enum Keyline {
        static let container: CGFloat = 2
        static let dense: CGFloat = 2
    }

    // Hard-shadow offsets (no blur, `risoShadowInk`). Press = translate by
    // the offset and collapse the shadow to 0 — see `RisoButtonStyle`.
    enum Shadow {
        static let card: CGFloat = 2     // no 4pt shadow in the spec
        static let button: CGFloat = 3   // icon buttons, QR tile
        static let small: CGFloat = 2    // cells, avatars, small cards
        static let banner: CGFloat = 5   // bingo banner
    }

    /// The share view's QR tile — the only hex values outside the colorsets.
    /// Static (no dark-mode flip) so the code stays scannable.
    enum QR {
        static let cream = Color(red: 0xFB / 255, green: 0xF6 / 255, blue: 0xEA / 255)  // #fbf6ea
        static let ink = Color(red: 0x18 / 255, green: 0x12 / 255, blue: 0x0B / 255)    // #18120b
        static let border: CGFloat = 2
    }

    // Spacing
    /// Corner status chip on a board square (lock / staged-edit), per the
    /// design-system "Lock a Square" template: a small keylined tile notched
    /// onto the top-trailing corner, overhanging the cell edge so it never
    /// covers the label.
    enum CornerChip {
        static let size: CGFloat = 20
        static let radius: CGFloat = 6
        /// How far the chip hangs past the cell's edge on both axes.
        static let overhang: CGFloat = 6
        static let spacing: CGFloat = 3
    }

    static let gutter: CGFloat = 20
    static let cardPadding: CGFloat = 14
    static let cellGap: CGFloat = 7

    /// Press animation duration (the "press into the paper" effect).
    static let pressDuration: Double = 0.10
}

// MARK: - Bundle

/// Marker used to resolve the OYBC app bundle from any execution context
/// (the app itself or an app-hosted test target), so named colors and
/// fonts load identically under snapshot tests.
private final class RisoBundleToken {}

extension Bundle {
    static let riso = Bundle(for: RisoBundleToken.self)
}

// MARK: - Colors

extension Color {
    static let risoPaper = Color("RisoPaper", bundle: .riso)
    static let risoPaper2 = Color("RisoPaper2", bundle: .riso)
    static let risoInk = Color("RisoInk", bundle: .riso)
    /// Hairline divider: ink at 14% (light) / cream at 16% (dark).
    static let risoHair = Color("RisoHair", bundle: .riso)
    /// Hard-shadow ink: `#1C140C` in light, pure black in dark (where
    /// `risoInk` is cream and would draw a cream shadow).
    static let risoShadowInk = Color("RisoShadowInk", bundle: .riso)
    /// Non-inverting dark ink (`#18120B` in both light and dark). `risoInk`
    /// flips to cream in dark mode, which is unreadable on the always-bright
    /// `risoGold` accent and makes `.multiply` overprint dots vanish. Use this
    /// for content placed on gold and for halftone/overprint dots.
    static let risoInkStatic = Color("RisoInkStatic", bundle: .riso)
    /// Non-inverting cream (`#FBF6EA` in both light and dark) — web's
    /// `--riso-on-color`. Use for content sitting on the saturated accent
    /// fills (blue/red), e.g. the initials avatar glyph, where `risoPaper`
    /// would flip to near-black in dark mode.
    static let risoOnColor = Color("RisoOnColor", bundle: .riso)
    /// Non-inverting pale lavender (`#C9CFF2` in both light and dark) — web's
    /// `--riso-lavender`. Secondary copy on the saturated blue celebration
    /// grounds (celebration overlays); like `risoOnColor`
    /// it reads against the fill, never the page, so it does not flip.
    static let risoLavender = Color("RisoLavender", bundle: .riso)
    static let risoMuted = Color("RisoMuted", bundle: .riso)
    static let risoBlue = Color("RisoBlue", bundle: .riso)
    static let risoRed = Color("RisoRed", bundle: .riso)
    static let risoGreen = Color("RisoGreen", bundle: .riso)
    static let risoGold = Color("RisoGold", bundle: .riso)
    static let risoAchievement = Color("RisoAchievement", bundle: .riso)
    /// Compound task type. A dark fill like blue/red/green — content on it
    /// uses `risoPaper` / `risoOnColor`, same as those.
    static let risoTeal = Color("RisoTeal", bundle: .riso)
}

// MARK: - Fonts

/// Display / heading face — Bricolage Grotesque. Two bundled weights.
enum RisoHeadWeight {
    case bold       // 700
    case extraBold  // 800
    var psName: String {
        switch self {
        case .bold: return "BricolageGrotesque-Bold"
        case .extraBold: return "BricolageGrotesque-ExtraBold"
        }
    }
}

/// Body / metadata face — Archivo. Five bundled weights.
enum RisoBodyWeight {
    case regular    // 400
    case medium     // 500
    case semibold   // 600
    case bold       // 700
    case extraBold  // 800
    var psName: String {
        switch self {
        case .regular: return "Archivo-Regular"
        case .medium: return "Archivo-Medium"
        case .semibold: return "Archivo-SemiBold"
        case .bold: return "Archivo-Bold"
        case .extraBold: return "Archivo-ExtraBold"
        }
    }
}

extension Font {
    /// Bricolage Grotesque at `size`, scaling with Dynamic Type relative to
    /// `.title`. (Snapshots run at the default content size, so they stay
    /// deterministic.)
    static func risoHead(_ size: CGFloat, _ weight: RisoHeadWeight = .extraBold) -> Font {
        .custom(weight.psName, size: size, relativeTo: .title)
    }

    /// Archivo at `size`, scaling with Dynamic Type relative to `.body`.
    static func risoBody(_ size: CGFloat, _ weight: RisoBodyWeight = .regular) -> Font {
        .custom(weight.psName, size: size, relativeTo: .body)
    }
}
