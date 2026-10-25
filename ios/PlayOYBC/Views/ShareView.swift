import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

/// The host's share sheet (web `LobbySheet` expanded QR), presented as a `.medium` detent
/// from the lobby sheet's QR tile: the game code, a 160pt QR on the static cream tile,
/// Copy link and Done.
struct ShareSheetView: View {
    let code: String
    let onDone: () -> Void

    private var link: String { GameConstants.joinLink(code: code) }

    var body: some View {
        ZStack {
            Color.risoPaper2.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    SectionLabel("Game code")
                    GameCodeText(code: code)
                }
                HStack(alignment: .center, spacing: 16) {
                    QRTile(link: link, side: 160, radius: Riso.cardRadius, shadow: Riso.Shadow.button)
                        .accessibilityLabel("QR code")
                    VStack(spacing: 10) {
                        CopyLinkButton(link: link, fullWidth: true)
                        RisoButton(title: "Done", kind: .ghost, fullWidth: true, action: onDone)
                    }
                }
            }
            .padding(.horizontal, Riso.gutter)
            .padding(.top, 28)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}

/// The game code as the lobby shows it: Bricolage 800 34pt, +.1em, read letter by letter.
struct GameCodeText: View {
    let code: String
    var color: Color = .risoInk

    var body: some View {
        Text(code)
            .font(.risoHead(34, .extraBold))
            .tracking(3.4)
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .accessibilityLabel("Game code")
            .accessibilityValue(code.map(String.init).joined(separator: " "))
    }
}

/// A QR of `link` on the static cream tile with the static ink keyline (never themed, so it
/// always scans) and a hard shadow.
struct QRTile: View {
    let link: String
    let side: CGFloat
    var radius: CGFloat = 6
    var shadow: CGFloat = Riso.Shadow.small
    var pad: CGFloat = 4

    var body: some View {
        Group {
            if let qr = QRCode.image(for: link) {
                Image(uiImage: qr)
                    .interpolation(.none)
                    .resizable()
                    .blendMode(.multiply)  // white modules take the cream tile
            } else {
                Color.clear
            }
        }
        .padding(pad)
        .frame(width: side, height: side)
        .background(Riso.QR.cream)
        .clipShape(RoundedRectangle(cornerRadius: radius))
        .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(Riso.QR.ink, lineWidth: Riso.QR.border))
        .risoHardShadow(shadow, radius: radius)
    }
}

/// Copies the join link; reads "Copied" for two seconds once it did (web `CopyLinkButton`).
struct CopyLinkButton: View {
    let link: String
    var fullWidth = false
    var small = false
    @State var copied = false
    @State private var reset: _Concurrency.Task<Void, Never>?

    /// How long "Copied" stays before reverting to "Copy link".
    static let copiedSeconds: Double = 2

    var body: some View {
        RisoButton(title: copied ? "Copied" : "Copy link", systemImage: "square.and.arrow.up",
                   fullWidth: fullWidth, small: small) { copy() }
            .onDisappear { reset?.cancel() }
    }

    private func copy() {
        UIPasteboard.general.string = link
        copied = true
        reset?.cancel()
        reset = _Concurrency.Task { @MainActor in
            try? await _Concurrency.Task.sleep(nanoseconds: UInt64(Self.copiedSeconds * 1_000_000_000))
            if !_Concurrency.Task.isCancelled { copied = false }
        }
    }
}

/// QR rendering via `CIFilter.qrCodeGenerator`; the view adds cream padding as quiet zone.
enum QRCode {
    private static let context = CIContext()

    /// A crisp QR image for `text`, or nil if CoreImage fails.
    static func image(for text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let raw = filter.outputImage else { return nil }
        let scaled = raw.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
