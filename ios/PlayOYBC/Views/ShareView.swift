import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

/// The game code; for the host also a QR of the join link, the link, and Copy link (web `ShareCard`).
struct ShareView: View {
    let code: String
    let isHost: Bool
    @State var copied = false

    private var link: String { GameConstants.joinLink(code: code) }

    var body: some View {
        RisoCardBox(alignment: .center) {
            Text(code)
                .font(.risoHead(40, .extraBold))
                .tracking(4.8)
                .foregroundStyle(Color.risoInk)
                .accessibilityLabel("Game code \(code.map(String.init).joined(separator: " "))")
            if isHost {
                if let qr = QRCode.image(for: link) {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 176, height: 176)
                        .blendMode(.multiply)  // white modules take the cream tile
                        .padding(4)
                        .background(Riso.QR.cream)
                        .clipShape(RoundedRectangle(cornerRadius: Riso.cardRadius))
                        .overlay(RoundedRectangle(cornerRadius: Riso.cardRadius).strokeBorder(Riso.QR.ink, lineWidth: Riso.QR.border))
                        .accessibilityLabel("QR code")
                }
                Text(link)
                    .font(.risoBody(14, .semibold))
                    .foregroundStyle(Color.risoBlue)
                    .multilineTextAlignment(.center)
                    .textSelection(.enabled)
                RisoButton(title: copied ? "Copied" : "Copy link", fullWidth: true) {
                    UIPasteboard.general.string = link
                    copied = true
                }
            }
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
