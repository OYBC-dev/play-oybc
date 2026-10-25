import SwiftUI

/// One confetti piece (web `Confetti.makePieces`): position as a 0-100 fraction, size, shape,
/// token colour, fall duration and start delay.
struct ConfettiPiece: Equatable {
    var left: Double
    var width: Double
    var height: Double
    var round: Bool
    var colorIndex: Int
    var duration: Double
    var delay: Double
}

enum ConfettiBurst {
    static let pieceCount = 54
    /// Token colours only: red, blue, gold, green.
    static let colors: [Color] = [.risoRed, .risoBlue, .risoGold, .risoGreen]

    /// The pieces of one burst, deterministic per seed (same LCG as web): 6-12 x 9-17 pt,
    /// 1.9-3.2 s fall, 0-520 ms jitter.
    static func pieces(seed: Int) -> [ConfettiPiece] {
        var s = UInt32(truncatingIfNeeded: seed &* 2_654_435_761 &+ 20_261_031)
        func next() -> Double {
            s = s &* 1_664_525 &+ 1_013_904_223
            return Double(s) / 4_294_967_296
        }
        return (0..<pieceCount).map { _ in
            ConfettiPiece(left: (next() * 100).rounded(),
                          width: 6 + (next() * 6).rounded(),
                          height: 9 + (next() * 8).rounded(),
                          round: next() < 0.3,
                          colorIndex: Int(next() * Double(colors.count)),
                          duration: 1.9 + next() * 1.3,
                          delay: (next() * 520).rounded() / 1000)
        }
    }

    /// Seconds until the last piece has landed.
    static func totalSeconds(_ pieces: [ConfettiPiece]) -> Double {
        pieces.map { $0.duration + $0.delay }.max() ?? 0
    }
}

/// One non-interactive confetti burst over the screen; calls `onFinished` once the last piece
/// has landed so the caller can remove it.
struct BingoConfettiView: View {
    let seed: Int
    var onFinished: () -> Void = {}
    @State private var start = Date()
    private let pieces: [ConfettiPiece]

    init(seed: Int, onFinished: @escaping () -> Void = {}) {
        self.seed = seed
        self.onFinished = onFinished
        pieces = ConfettiBurst.pieces(seed: seed)
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { ctx, size in
                let elapsed = timeline.date.timeIntervalSince(start)
                for p in pieces {
                    let t = (elapsed - p.delay) / p.duration
                    guard t > 0, t < 1 else { continue }
                    let eased = 1 - pow(1 - t, 1.8)   // ease-out, close to web's cubic-bezier(.3,.5,.6,1)
                    let opacity = t < 0.06 ? t / 0.06 : 1 - 0.1 * t
                    let x = size.width * p.left / 100
                    let y = -18 + 838 * eased
                    var c = ctx
                    c.opacity = opacity
                    c.translateBy(x: x, y: y)
                    c.rotate(by: .degrees(640 * t))
                    let rect = CGRect(x: -p.width / 2, y: -p.height / 2, width: p.width, height: p.height)
                    let path = p.round ? Path(roundedRect: rect, cornerRadius: min(p.width, p.height) / 2)
                                       : Path(roundedRect: rect, cornerRadius: 1)
                    c.fill(path, with: .color(ConfettiBurst.colors[p.colorIndex]))
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task {
            try? await _Concurrency.Task.sleep(nanoseconds: UInt64((ConfettiBurst.totalSeconds(pieces) + 0.05) * 1_000_000_000))
            onFinished()
        }
    }
}
