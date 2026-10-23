import Combine
import Foundation

/// Persisted resume pointer: UserDefaults key `lastGame` = `{ code }`.
struct ResumeStore {
    static let key = "lastGame"
    var defaults: UserDefaults = .standard

    func save(code: String) {
        defaults.set(try? JSONEncoder().encode(["code": code]), forKey: Self.key)
    }

    func load() -> String? {
        guard let data = defaults.data(forKey: Self.key),
              let obj = try? JSONDecoder().decode([String: String].self, from: data) else { return nil }
        return obj["code"]
    }

    func clear() { defaults.removeObject(forKey: Self.key) }
}

/// Drives one seat's view of a game: merged snapshot, optimistic marks, bingo banners.
@MainActor
final class GameViewModel: ObservableObject {
    @Published private(set) var snapshot: GameSnapshot?
    @Published private(set) var banner: BingoDoc?
    @Published private(set) var pendingCells: Set<Int> = []
    @Published private(set) var error: Error?

    let gameId: String
    let seatId: String
    private let service: GameService
    private let bannerSeconds: Double
    private var serverSnapshot: GameSnapshot?
    /// Optimistic mark values per cell, overlaid on the server board until the call settles.
    private var overlay: [Int: Bool] = [:]
    private var queue = BingoBannerQueue()
    private var streamTask: _Concurrency.Task<Void, Never>?
    private var bannerTask: _Concurrency.Task<Void, Never>?

    init(service: GameService, gameId: String, seatId: String, bannerSeconds: Double = 4) {
        self.service = service
        self.gameId = gameId
        self.seatId = seatId
        self.bannerSeconds = bannerSeconds
    }

    deinit {
        streamTask?.cancel()
        bannerTask?.cancel()
    }

    /// Starts consuming the service's snapshot stream.
    func start() {
        guard streamTask == nil else { return }
        streamTask = _Concurrency.Task { [weak self, service, gameId, seatId] in
            do {
                for try await snap in service.subscribe(gameId: gameId, seatId: seatId) {
                    self?.apply(snap)
                }
            } catch {
                self?.error = error
            }
        }
    }

    func stop() {
        streamTask?.cancel()
        streamTask = nil
        bannerTask?.cancel()
    }

    /// Dismisses the current banner early.
    func dismissBanner() {
        queue.dismiss()
        refreshBanner()
    }

    /// Optimistically flips a cell, then reconciles with the server; rolls back on failure.
    func toggle(cell: Int) async {
        guard var board = serverSnapshot?.board, board.marks.indices.contains(cell),
              board.cells[cell] != .free, !pendingCells.contains(cell) else { return }
        board = effectiveBoard(board)
        overlay[cell] = !board.marks[cell]
        pendingCells.insert(cell)
        publish()
        do {
            let res = try await service.toggleMark(gameId: gameId, cellIndex: cell)
            overlay[cell] = nil
            if var b = serverSnapshot?.board {
                b.marks = res.marks
                b.completedLines = res.completedLines
                serverSnapshot?.board = b
            }
        } catch {
            overlay[cell] = nil
            self.error = error
        }
        pendingCells.remove(cell)
        publish()
    }

    private func apply(_ snap: GameSnapshot) {
        serverSnapshot = snap
        queue.observe(snap.bingos, mySeatId: snap.mySeatId)
        refreshBanner()
        publish()
    }

    private func effectiveBoard(_ board: BoardDoc) -> BoardDoc {
        var b = board
        for (i, v) in overlay where b.marks.indices.contains(i) { b.marks[i] = v }
        return b
    }

    private func publish() {
        guard var s = serverSnapshot else { snapshot = nil; return }
        if let b = s.board { s.board = effectiveBoard(b) }
        snapshot = s
    }

    private func refreshBanner() {
        let next = queue.current
        if next == banner { return }
        banner = next
        bannerTask?.cancel()
        guard next != nil else { return }
        bannerTask = _Concurrency.Task { [weak self, bannerSeconds] in
            try? await _Concurrency.Task.sleep(nanoseconds: UInt64(bannerSeconds * 1_000_000_000))
            guard !_Concurrency.Task.isCancelled else { return }
            self?.dismissBanner()
        }
    }
}
