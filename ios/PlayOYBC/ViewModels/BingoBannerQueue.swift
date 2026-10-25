import Foundation

/// Pure stack behind the "<Name> got a bingo!" banners (mirrors web `useBingoBanners` +
/// `BingoBanner`): up to `maxVisible` banners show at once, front first; each leaves
/// `showSeconds` after it appeared (its own deadline); the rest wait in arrival order and
/// appear as earlier ones leave. Bingos present at the first observation and the player's
/// own never show. Time is passed in explicitly, so nothing here owns a timer.
struct BingoBannerQueue {
    /// One banner on screen and the instant it appeared.
    struct Shown: Equatable { var bingo: BingoDoc; var shownAt: TimeInterval }

    static let maxVisible = 3
    static let showSeconds: TimeInterval = 4

    private(set) var visible: [Shown] = []
    private(set) var waiting: [BingoDoc] = []
    private var seen: Set<Int>?

    /// The front banner.
    var current: BingoDoc? { visible.first?.bingo }

    /// The banners on screen, front first.
    var banners: [BingoDoc] { visible.map(\.bingo) }

    /// The next instant a banner is due to leave, or nil when none is showing.
    var nextDeadline: TimeInterval? { visible.map { $0.shownAt + Self.showSeconds }.min() }

    /// Feed the latest announced bingos; the first call only records what already exists.
    mutating func observe(_ bingos: [BingoDoc], mySeatId: String, now: TimeInterval) {
        guard seen != nil else { seen = Set(bingos.map(\.seq)); return }
        let fresh = bingos.filter { !seen!.contains($0.seq) }
        guard !fresh.isEmpty else { return }
        fresh.forEach { seen!.insert($0.seq) }
        waiting.append(contentsOf: fresh.filter { $0.seatId != mySeatId }.sorted { $0.seq < $1.seq })
        advance(to: now)
    }

    /// Moves time forward: expires banners whose 4 s are up (in deadline order, so a waiting
    /// banner appears at the instant its slot freed) and fills free slots from the waiting list.
    mutating func advance(to now: TimeInterval) {
        while let due = nextDeadline, due <= now {
            visible.removeAll { $0.shownAt + Self.showSeconds <= due }
            fill(at: due)
        }
        fill(at: now)
    }

    /// Dismisses one banner early (the tap), promoting a waiting one.
    mutating func dismiss(seq: Int, now: TimeInterval) {
        visible.removeAll { $0.bingo.seq == seq }
        fill(at: now)
    }

    /// Dismisses the front banner early.
    mutating func dismissFront(now: TimeInterval) {
        if let seq = current?.seq { dismiss(seq: seq, now: now) }
    }

    private mutating func fill(at time: TimeInterval) {
        while visible.count < Self.maxVisible, !waiting.isEmpty {
            visible.append(Shown(bingo: waiting.removeFirst(), shownAt: time))
        }
    }
}
