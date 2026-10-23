import Foundation

/// Pure queue behind the "<Name> got a bingo!" banners (mirrors web `useBingoBanners`):
/// bingos present at the first observation and the player's own never show.
struct BingoBannerQueue {
    private(set) var queue: [BingoDoc] = []
    private var seen: Set<Int>?

    /// The banner currently on screen.
    var current: BingoDoc? { queue.first }

    /// Feed the latest announced bingos; the first call only records what already exists.
    mutating func observe(_ bingos: [BingoDoc], mySeatId: String) {
        guard seen != nil else { seen = Set(bingos.map(\.seq)); return }
        let fresh = bingos.filter { !seen!.contains($0.seq) }
        guard !fresh.isEmpty else { return }
        fresh.forEach { seen!.insert($0.seq) }
        queue.append(contentsOf: fresh.filter { $0.seatId != mySeatId }.sorted { $0.seq < $1.seq })
    }

    /// Drops the current banner, advancing to the next.
    mutating func dismiss() { if !queue.isEmpty { queue.removeFirst() } }
}
