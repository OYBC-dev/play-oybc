import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

/// The game code as the lobby shows it: Bricolage 800 34pt (38 in the expanded sheet), +.1em, read
/// letter by letter.
struct GameCodeText: View {
    let code: String
    var color: Color = .risoInk
    var size: CGFloat = 34

    var body: some View {
        Text(code)
            .font(.risoHead(size, .extraBold))
            .tracking(size / 10)
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
    var minHeight: CGFloat? = nil
    var horizontalPadding: CGFloat? = nil
    @State var copied = false
    @State private var reset: _Concurrency.Task<Void, Never>?

    /// How long "Copied" stays before reverting to "Copy link".
    static let copiedSeconds: Double = 2

    var body: some View {
        RisoButton(title: copied ? "Copied" : "Copy link", systemImage: "doc.on.doc",
                   fullWidth: fullWidth, small: small, minHeight: minHeight, horizontalPadding: horizontalPadding) { copy() }
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
