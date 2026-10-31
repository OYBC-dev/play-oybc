import Foundation
import Network

/// GameService over the game server: `createGame` is one HTTPS POST, everything else runs on the game's
/// room socket (one `RoomConnection` per code). Ops address the room by code, so the service keeps the
/// `gameId → code` map (memory + `UserDefaults` `play.codeFor.<gameId>`) from `createGame`, `joinGame` and
/// `whoAmI`. A finished `subscribe` only detaches; the room closes itself once idle.
/// The app forwards scene changes to `setActive(_:)`: rooms drop their sockets in the background and
/// reconnect in the foreground; a network path that becomes satisfied skips any backoff wait.
final class WebSocketGameService: GameService, @unchecked Sendable {
    /// The WebSocket base URL (`ws://` or `wss://`).
    let baseURL: URL
    private let session: FirebaseSession
    private let http: URLSession
    private let defaults: UserDefaults
    private let lock = NSLock()
    private var rooms: [String: RoomConnection] = [:]
    private var codes: [String: String] = [:]
    private var pendingTaskIds = PendingTaskIds()
    private var active = true
    private var pathSatisfied: Bool?
    private let monitor = NWPathMonitor()
    /// Scene changes, applied to the rooms one at a time and in order.
    private let lifecycle: AsyncStream<Bool>.Continuation
    private var lifecycleTask: _Concurrency.Task<Void, Never>?

    /// - Parameters:
    ///   - baseURL: the server's WebSocket base URL; HTTP calls use the matching `http(s)://`.
    ///   - session: signs in anonymously and supplies ID tokens.
    init(baseURL: URL, session: FirebaseSession, http: URLSession = .shared, defaults: UserDefaults = .standard) {
        self.baseURL = baseURL
        self.session = session
        self.http = http
        self.defaults = defaults
        let (changes, lifecycle) = AsyncStream<Bool>.makeStream()
        self.lifecycle = lifecycle
        lifecycleTask = _Concurrency.Task { [weak self] in
            for await isActive in changes {
                guard let rooms = self?.liveRooms() else { continue }
                for room in rooms {
                    if isActive { await room.resume() } else { await room.suspend() }
                }
            }
        }
        monitor.pathUpdateHandler = { [weak self] path in self?.pathChanged(path.status == .satisfied) }
        monitor.start(queue: DispatchQueue(label: "com.oybc.PlayOYBC.path"))
    }

    deinit {
        monitor.cancel()
        lifecycle.finish()
        lifecycleTask?.cancel()
    }

    /// The server URL: launch argument `-gameServer <url>` (UserDefaults `gameServer`), else Info.plist `GameServerURL`.
    static func configuredBaseURL(defaults: UserDefaults = .standard, bundle: Bundle = .main) -> URL {
        let raw = defaults.string(forKey: "gameServer") ?? bundle.object(forInfoDictionaryKey: "GameServerURL") as? String
        guard let raw, let url = URL(string: raw) else { preconditionFailure("GameServerURL is missing from Info.plist") }
        return url
    }

    /// Forwards a scene-phase change: `false` (background) suspends every room; `true` (active) resumes them.
    func setActive(_ isActive: Bool) {
        let changed = lock.withLock { () -> Bool in
            defer { active = isActive }
            return active != isActive
        }
        if changed { lifecycle.yield(isActive) }
    }

    // MARK: rooms and codes

    /// The live room for `code`, opening a new one when none is.
    private func room(_ code: String) -> RoomConnection {
        lock.withLock {
            if let live = rooms[code], !live.isClosed { return live }
            // Born suspended in the background, so no later suspend can race the next resume.
            let room = RoomConnection(url: baseURL, code: code, tokenProvider: { [session] in try await session.idToken() },
                                      startSuspended: !active)
            rooms[code] = room
            return room
        }
    }

    private func liveRooms() -> [RoomConnection] {
        lock.withLock {
            rooms = rooms.filter { !$0.value.isClosed }
            return Array(rooms.values)
        }
    }

    private func pathChanged(_ satisfied: Bool) {
        let regained = lock.withLock { () -> Bool in
            defer { pathSatisfied = satisfied }
            return satisfied && pathSatisfied == false
        }
        guard regained else { return }
        for room in liveRooms() { _Concurrency.Task { await room.wake() } }
    }

    private static func codeKey(_ gameId: String) -> String { "play.codeFor.\(gameId)" }

    private func remember(gameId: String, code: String) {
        lock.withLock { codes[gameId] = code }
        defaults.set(code, forKey: Self.codeKey(gameId))
    }

    private func codeFor(_ gameId: String) -> String? {
        if let known = lock.withLock({ codes[gameId] }) { return known }
        return defaults.string(forKey: Self.codeKey(gameId))
    }

    /// Runs `op` on the room holding `gameId`.
    private func act<T: Decodable>(_ gameId: String, _ op: String, _ args: [String: Any]) async throws -> T {
        guard let code = codeFor(gameId) else { throw AppError.gameNotFound }
        return try await room(code).act(op, args)
    }

    private func actVoid(_ gameId: String, _ op: String, _ args: [String: Any]) async throws {
        let _: EmptyResult = try await act(gameId, op, args)
    }

    // MARK: GameService

    func createGame(name: String, gameName: String?, freeSpace: Bool) async throws -> CreateGameRes {
        let token: String
        do { token = try await session.idToken() } catch { throw AppError.from(error) }
        var req = URLRequest(url: Self.httpURL(baseURL).appendingPathComponent("api/createGame"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONEncoder().encode(CreateGameReq(name: name, gameName: gameName, freeSpace: freeSpace))
        let data: Data, response: URLResponse
        do { (data, response) = try await http.data(for: req) } catch { throw AppError(code: "offline", token: nil, underlying: error) }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let code = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.code ?? "unknown"
            throw AppError(code: code, token: nil, underlying: nil)
        }
        let out: CreateGameRes
        do { out = try JSONDecoder().decode(CreateGameRes.self, from: data) } catch { throw AppError(code: "unknown", token: nil, underlying: error) }
        remember(gameId: out.gameId, code: out.code)
        return out
    }

    func joinGame(code: String, name: String, reclaim: Bool) async throws -> JoinGameRes {
        var args: [String: Any] = ["name": name]
        if reclaim { args["reclaim"] = true }
        let res: JoinGameRes = try await room(code).act("join", args)
        switch res {
        case let .joined(g, _), let .resumed(g, _), let .reclaimPending(g, _): remember(gameId: g, code: code)
        }
        return res
    }

    func whoAmI(code: String) async throws -> WhoAmIRes? {
        let w = try await room(code).hello()
        remember(gameId: w.gameId, code: code)
        return w.seatId.map { WhoAmIRes(gameId: w.gameId, seatId: $0) }
    }

    func subscribe(gameId: String, seatId: String) -> AsyncThrowingStream<GameSnapshot, Error> {
        AsyncThrowingStream { cont in
            let task = _Concurrency.Task { [weak self] in
                guard let self else { return cont.finish() }
                guard let code = self.codeFor(gameId) else { return cont.finish(throwing: AppError.gameNotFound) }
                let room = self.room(code)
                // A relaunch that skipped whoAmI: say hello to this game (a mismatch ends the room 4004).
                await room.address(gameId: gameId)
                await Self.forward(await room.snapshots(), fatal: await room.fatal(), room: room, into: cont)
            }
            cont.onTermination = { _ in task.cancel() }
        }
    }

    func watchReclaim(gameId: String, reclaimId: String) -> AsyncThrowingStream<ReclaimStatus, Error> {
        AsyncThrowingStream { cont in
            let task = _Concurrency.Task { [weak self] in
                guard let self else { return cont.finish() }
                guard let code = self.codeFor(gameId) else { return cont.finish(throwing: AppError.gameNotFound) }
                let room = self.room(code)
                await Self.forward(await room.reclaimStatus(id: reclaimId), fatal: await room.fatal(), room: room, into: cont)
            }
            cont.onTermination = { _ in task.cancel() }
        }
    }

    func addTask(gameId: String, text: String) async throws {
        let taskId = lock.withLock { pendingTaskIds.id(gameId: gameId, text: text) }
        try await actVoid(gameId, "addTask", ["taskId": taskId, "text": text])
        lock.withLock { pendingTaskIds.confirm(gameId: gameId, text: text) }
    }

    func deleteTask(gameId: String, taskId: String) async throws { try await actVoid(gameId, "deleteTask", ["taskId": taskId]) }
    func launch(gameId: String) async throws { try await actVoid(gameId, "launch", [:]) }
    func setOptions(gameId: String, freeSpace: Bool) async throws {
        try await actVoid(gameId, "setOptions", ["freeSpace": freeSpace])
    }

    func bindName(gameId: String, key: String, seatId: String?) async throws {
        try await actVoid(gameId, "bindName", Self.bindNameArgs(key: key, seatId: seatId))
    }

    func retireName(gameId: String, key: String) async throws {
        try await actVoid(gameId, "retireName", ["key": key])
    }

    /// `bindName` args: `seatId` goes out as an explicit JSON `null` for "nobody yet".
    static func bindNameArgs(key: String, seatId: String?) -> [String: Any] {
        ["key": key, "seatId": seatId.map { $0 as Any } ?? NSNull()]
    }

    func toggleMark(gameId: String, cellIndex: Int, marked: Bool) async throws -> ToggleMarkRes {
        try await act(gameId, "mark", ["cellIndex": cellIndex, "marked": marked])
    }

    func end(gameId: String) async throws { try await actVoid(gameId, "end", [:]) }

    func resolveReclaim(gameId: String, reclaimId: String, approve: Bool) async throws {
        try await actVoid(gameId, "resolveReclaim", ["reclaimId": reclaimId, "approve": approve])
    }

    func transferHost(gameId: String, toSeatId: String) async throws {
        try await actVoid(gameId, "transferHost", ["toSeatId": toSeatId])
    }

    // MARK: helpers

    /// `{code}` of a failed HTTP call.
    private struct ErrorBody: Decodable { var code: String }

    /// The `http(s)://` twin of a `ws(s)://` URL.
    static func httpURL(_ ws: URL) -> URL {
        guard var c = URLComponents(url: ws, resolvingAgainstBaseURL: false) else { return ws }
        switch c.scheme {
        case "wss": c.scheme = "https"
        case "ws": c.scheme = "http"
        default: break
        }
        return c.url ?? ws
    }

    /// Forwards `values` into `cont` until the consumer cancels or the room ends; an ending room finishes
    /// `cont` with its fatal error (or `offline` when it closed for another reason).
    private static func forward<T>(_ values: AsyncStream<T>, fatal: AsyncStream<AppError>, room: RoomConnection,
                                   into cont: AsyncThrowingStream<T, Error>.Continuation) async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                for await err in fatal {
                    cont.finish(throwing: err)
                    return
                }
                if !_Concurrency.Task.isCancelled { cont.finish(throwing: await room.fatalCause ?? AppError.offline) }
            }
            group.addTask {
                for await value in values { cont.yield(value) }
                if !_Concurrency.Task.isCancelled { cont.finish(throwing: await room.fatalCause ?? AppError.offline) }
            }
            await group.next()
            group.cancelAll()
        }
    }
}

/// The taskId an unconfirmed `addTask` text was sent with, so a retry of the same (trimmed) text reuses it and
/// an add that landed before its ack was lost is not added twice.
struct PendingTaskIds {
    private var ids: [String: String] = [:]

    /// The id to send `text` with: the unconfirmed one for the same text, else a new one.
    mutating func id(gameId: String, text: String) -> String {
        let key = Self.key(gameId, text)
        if let id = ids[key] { return id }
        let id = UUID().uuidString.lowercased()
        ids[key] = id
        return id
    }

    /// The add of `text` was acked: a later add of the same text is a new task.
    mutating func confirm(gameId: String, text: String) { ids[Self.key(gameId, text)] = nil }

    private static func key(_ gameId: String, _ text: String) -> String {
        "\(gameId)\u{0}\(text.trimmingCharacters(in: .whitespacesAndNewlines))"
    }
}
