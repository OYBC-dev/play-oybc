// Usage (from ios/): swift scripts/make_icon.swift PlayOYBC/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png
// Deterministic 1024x1024 opaque app icon: Riso gold ground, ink 3x3 bingo grid, red centre.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let size = 1024
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
func rgb(_ r: Int, _ g: Int, _ b: Int) -> CGColor { CGColor(colorSpace: cs, components: [CGFloat(r)/255, CGFloat(g)/255, CGFloat(b)/255, 1])! }
let gold = rgb(0xFF, 0xC2, 0x1F), ink = rgb(0x18, 0x12, 0x0B), red = rgb(0xEB, 0x4D, 0x2E), cream = rgb(0xFB, 0xF6, 0xEA)
ctx.setFillColor(gold); ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
func rounded(_ r: CGRect, _ rad: CGFloat) -> CGPath { CGPath(roundedRect: r, cornerWidth: rad, cornerHeight: rad, transform: nil) }
// Board: ink plate, cream cells, one red marked centre square.
let board = CGRect(x: 192, y: 192, width: 640, height: 640)
ctx.setFillColor(ink); ctx.addPath(rounded(board, 64)); ctx.fillPath()
let gap: CGFloat = 28, inset: CGFloat = 44
let cell = (board.width - inset * 2 - gap * 2) / 3
for r in 0..<3 { for c in 0..<3 {
    let rect = CGRect(x: board.minX + inset + CGFloat(c) * (cell + gap), y: board.minY + inset + CGFloat(r) * (cell + gap), width: cell, height: cell)
    ctx.setFillColor(r == 1 && c == 1 ? red : cream)
    ctx.addPath(rounded(rect, 24)); ctx.fillPath()
} }
let img = ctx.makeImage()!
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
