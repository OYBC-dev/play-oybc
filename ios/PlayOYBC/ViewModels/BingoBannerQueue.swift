import Foundation

/// Pure FIFO behind the "<Name> got a bingo!" banners (mirrors web `useBingoBanners` +
/// `BingoBanner`): banners queue in arrival order and up to `maxVisible` render at once,
/// front first. Only the FRONT banner's clock runs: it leaves `showSeconds` after it became
/// the front, then the next moves to front and starts its own 4 s. Bingos present at the
/// first observation and the player's own never show. Time is passed in explicitly, so
/// nothing here owns a timer.
struct BingoBannerQueue {
    static let maxVisible = 3
    static let showSeconds: TimeInterval = 4

    /// Every queued banner, front first (rendered and waiting).
    private(set) var queue: [BingoDoc] = []
    /// The instant the current front banner became the front, or nil when the queue is empty.
    private(set) var frontSince: TimeInterval?
    private var seen: Set<Int>?

    /// The front banner.
    var current: BingoDoc? { queue.first }

    /// The banners on screen, front first (at most `maxVisible`).
    var banners: [BingoDoc] { Array(queue.prefix(Self.maxVisible)) }

    /// Banners queued behind the rendered stack.
    var waiting: [BingoDoc] { Array(queue.dropFirst(Self.maxVisible)) }

    /// The instant the front banner is due to leave, or nil when none is showing.
    var nextDeadline: TimeInterval? { frontSince.map { $0 + Self.showSeconds } }

    /// Feed the latest announced bingos; the first call only records what already exists.
    mutating func observe(_ bingos: [BingoDoc], mySeatId: String, now: TimeInterval) {
        guard seen != nil else { seen = Set(bingos.map(\.seq)); return }
        let fresh = bingos.filter { !seen!.contains($0.seq) }
        guard !fresh.isEmpty else { return }
        fresh.forEach { seen!.insert($0.seq) }
        advance(to: now)
        let others = fresh.filter { $0.seatId != mySeatId }.sorted { $0.seq < $1.seq }
        guard !others.isEmpty else { return }
        if queue.isEmpty { frontSince = now }
        queue.append(contentsOf: others)
    }

    /// Moves time forward: each front whose 4 s are up leaves, and the next becomes the front
    /// at the instant the previous one left (so its own 4 s start then, not at `now`).
    mutating func advance(to now: TimeInterval) {
        while let due = nextDeadline, due <= now {
            queue.removeFirst()
            frontSince = queue.isEmpty ? nil : due
        }
    }

    /// Dismisses one banner early (the tap); dismissing the front starts the next one's clock.
    mutating func dismiss(seq: Int, now: TimeInterval) {
        guard let i = queue.firstIndex(where: { $0.seq == seq }) else { return }
        queue.remove(at: i)
        if i == 0 { frontSince = queue.isEmpty ? nil : now }
    }

    /// Dismisses the front banner early.
    mutating func dismissFront(now: TimeInterval) {
        if let seq = current?.seq { dismiss(seq: seq, now: now) }
    }
}
