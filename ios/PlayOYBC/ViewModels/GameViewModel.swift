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
    /// In-flight cells whose call has taken longer than `pendingDimSeconds`; these render dimmed.
    @Published private(set) var slowCells: Set<Int> = []
    /// The last failed toggle (shown under the board); cleared by the next toggle.
    @Published private(set) var error: AppError?
    /// The listener failed; the game can no longer be shown (permission-denied = seat lost).
    @Published private(set) var streamError: AppError?

    let gameId: String
    let seatId: String
    private let service: GameService
    private let bannerSeconds: Double
    private let sleeper: Sleeper
    private var serverSnapshot: GameSnapshot?
    /// Optimistic mark values per cell, overlaid on the server board until the call settles.
    private var overlay: [Int: Bool] = [:]
    private var queue = BingoBannerQueue()
    private var streamTask: _Concurrency.Task<Void, Never>?
    private var bannerTask: _Concurrency.Task<Void, Never>?
    private var dimTasks: [Int: _Concurrency.Task<Void, Never>] = [:]
    /// A square in flight only looks dimmed once its call has taken this long.
    static let pendingDimSeconds = 0.25

    init(service: GameService, gameId: String, seatId: String, bannerSeconds: Double = 4, sleeper: @escaping Sleeper = GameViewModel.realSleep) {
        self.service = service
        self.gameId = gameId
        self.seatId = seatId
        self.bannerSeconds = bannerSeconds
        self.sleeper = sleeper
    }

    /// Injectable delay so banner timing is testable without real sleeps.
    typealias Sleeper = @Sendable (Double) async throws -> Void
    nonisolated static let realSleep: Sleeper = { try await _Concurrency.Task.sleep(nanoseconds: UInt64($0 * 1_000_000_000)) }

    deinit {
        streamTask?.cancel()
        bannerTask?.cancel()
    }

    /// Starts consuming the service's snapshot stream.
    func start() {
        guard streamTask == nil else { return }
        streamTask = _Concurrency.Task { [weak self] in await self?.run() }
    }

    /// Consumes the snapshot stream until it ends or the calling task is cancelled (the view
    /// drives this from `.task`, so it lives exactly as long as the screen).
    func run() async {
        do {
            for try await snap in service.subscribe(gameId: gameId, seatId: seatId) {
                apply(snap)
            }
        } catch {
            if !_Concurrency.Task.isCancelled { streamError = AppError.from(error) }
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

    /// Optimistically flips a cell, then calls the server. The optimistic mark stays until the
    /// next snapshot arrives (the snapshot wins); a failed call rolls it back.
    func toggle(cell: Int) async {
        guard serverSnapshot?.game.stage == .playing,
              let server = serverSnapshot?.board, server.marks.indices.contains(cell),
              server.cells[cell] != .free, !pendingCells.contains(cell) else { return }
        let want = !effectiveBoard(server).marks[cell]
        overlay[cell] = want
        error = nil
        pendingCells.insert(cell)
        dimTasks[cell] = _Concurrency.Task { [weak self, sleeper] in
            try? await sleeper(Self.pendingDimSeconds)
            guard !_Concurrency.Task.isCancelled, let self, self.pendingCells.contains(cell) else { return }
            self.slowCells.insert(cell)
        }
        publish()
        do {
            _ = try await service.toggleMark(gameId: gameId, cellIndex: cell, marked: want)
            error = nil
        } catch {
            overlay[cell] = nil
            self.error = AppError.from(error)
        }
        pendingCells.remove(cell)
        dimTasks.removeValue(forKey: cell)?.cancel()
        slowCells.remove(cell)
        publish()
    }

    private func apply(_ snap: GameSnapshot) {
        let boardChanged = snap.board != serverSnapshot?.board
        serverSnapshot = snap
        // A new board is authoritative for every cell with no call in flight. A snapshot that
        // only changed other parts (e.g. someone else's bingo bumped the game doc) keeps the
        // optimistic marks, so they do not flicker back before the board update lands.
        if boardChanged { overlay = overlay.filter { pendingCells.contains($0.key) } }
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
        bannerTask = _Concurrency.Task { [weak self, bannerSeconds, sleeper] in
            try? await sleeper(bannerSeconds)
            guard !_Concurrency.Task.isCancelled else { return }
            self?.dismissBanner()
        }
    }
}

/// Where the app is: home, a join flow for a code, or seated in a game.
enum AppRoute: Equatable {
    case home
    case join(code: String)
    case game(code: String, gameId: String, seatId: String)
}

/// A game the launch check found this device still seated in.
struct ResumedGame: Equatable { var code: String; var gameId: String; var seatId: String }

/// A saved game whose launch check failed transiently; Home offers to try it again.
struct ResumePrompt: Equatable { var code: String; var busy = false; var error: String? }

/// App-level state the UI layer drives: launch warm-up, resume, remembering the joined game.
@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var resumed: ResumedGame?
    @Published private(set) var launched = false
    @Published private(set) var route: AppRoute = .home
    /// Set when the saved game could not be checked (offline, server hiccup); nil otherwise.
    @Published private(set) var resumePrompt: ResumePrompt?
    let service: GameService
    private let store: ResumeStore

    init(service: GameService, store: ResumeStore = ResumeStore()) {
        self.service = service
        self.store = store
    }

    /// At launch: if `lastGame` holds a code, ask the server where this uid sits.
    /// A definitive answer (no seat, or no such game) clears the pointer; any other failure keeps it
    /// and shows the resume prompt on Home.
    func launch() async {
        defer { launched = true }
        guard let code = store.load() else { return }
        if await check(code: code) != nil { resumePrompt = ResumePrompt(code: code) }
    }

    /// Home's resume prompt: checks the saved game again. Failing again keeps the prompt with the error.
    func retryResume() async {
        guard let prompt = resumePrompt, !prompt.busy else { return }
        resumePrompt?.busy = true
        resumePrompt?.error = nil
        if let failure = await check(code: prompt.code) {
            resumePrompt = ResumePrompt(code: prompt.code, error: ErrorMessages.message(for: failure))
        }
    }

    /// Asks where this uid sits in `code`'s game and routes there. Returns the error only for a
    /// transient failure (the pointer is kept); every definitive answer also clears the prompt.
    private func check(code: String) async -> Error? {
        do {
            if let me = try await service.whoAmI(code: code) {
                resumePrompt = nil
                resumed = ResumedGame(code: code, gameId: me.gameId, seatId: me.seatId)
                route = .game(code: code, gameId: me.gameId, seatId: me.seatId)
            } else {
                forget()
            }
            return nil
        } catch {
            if AppError.from(error).code == AppError.gameNotFound.code {
                forget()
                return nil
            }
            resumed = nil
            return error
        }
    }

    /// Records the joined game for resume on the next launch.
    func remember(code: String) { store.save(code: code) }

    /// Forgets the game (left or ended).
    func forget() { store.clear(); resumed = nil; resumePrompt = nil }

    /// Shows the join flow for a code.
    func openJoin(code: String) { route = .join(code: code) }

    /// Seats this device in a game and remembers it for resume.
    func seat(code: String, gameId: String, seatId: String) {
        resumePrompt = nil
        remember(code: code)
        route = .game(code: code, gameId: gameId, seatId: seatId)
    }

    /// Leaves for Home and forgets the game.
    func goHome() {
        forget()
        route = .home
    }
}
