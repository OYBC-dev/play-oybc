import Foundation
import os

private let log = Logger(subsystem: "com.oybc.PlayOYBC", category: "room")

// MARK: - Wire

/// The server's answer to `hello`. `seatId` is nil when this uid holds no seat yet; `gameName` is absent
/// when the host set none; `hostName` is the host seat's display name (absent from older servers).
struct Welcome: Decodable, Equatable {
    var uid: String
    var gameId: String
    var seatId: String?
    var stage: Stage
    var rev: Int
    var gameName: String? = nil
    var hostName: String? = nil
}

/// A `state` frame: each present section replaces the held copy wholesale. `board` is doubly optional
/// because `null` (no board dealt) and absent (unchanged) mean different things.
struct StateFrame: Decodable, Equatable {
    var rev: Int
    var game: GameDoc?
    var seats: [Seat]?
    var view: [PoolViewEntry]?
    var board: BoardDoc??
    var bingos: [BingoDoc]?
    var standings: [Standing]?
    var reclaims: [Reclaim]?
    var roster: [RosterName]?

    private enum Keys: String, CodingKey { case rev, game, seats, view, board, bingos, standings, reclaims, roster }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        rev = try c.decode(Int.self, forKey: .rev)
        game = try c.decodeIfPresent(GameDoc.self, forKey: .game)
        seats = try c.decodeIfPresent([WireSeat].self, forKey: .seats)?.map(\.seat)
        view = try c.decodeIfPresent([PoolViewEntry].self, forKey: .view)
        if c.contains(.board) {
            board = .some(try c.decodeNil(forKey: .board) ? nil : try c.decode(BoardDoc.self, forKey: .board))
        } else {
            board = .none
        }
        bingos = try c.decodeIfPresent([BingoDoc].self, forKey: .bingos)
        standings = try c.decodeIfPresent([Standing].self, forKey: .standings)
        reclaims = try c.decodeIfPresent([WireReclaim].self, forKey: .reclaims)?.map(\.reclaim)
        roster = try c.decodeIfPresent([RosterName].self, forKey: .roster)
    }
}

/// A seat as the server sends it: the seat doc with its `seatId` inline.
private struct WireSeat: Decodable {
    var seat: Seat
    private enum Keys: String, CodingKey { case seatId }
    init(from decoder: Decoder) throws {
        let id = try decoder.container(keyedBy: Keys.self).decode(String.self, forKey: .seatId)
        seat = Seat(seatId: id, doc: try SeatDoc(from: decoder))
    }
}

/// A reclaim as the server sends it: the reclaim doc with its `id` inline.
private struct WireReclaim: Decodable {
    var reclaim: Reclaim
    private enum Keys: String, CodingKey { case id }
    init(from decoder: Decoder) throws {
        let id = try decoder.container(keyedBy: Keys.self).decode(String.self, forKey: .id)
        reclaim = Reclaim(id: id, doc: try ReclaimDoc(from: decoder))
    }
}

/// An `ack` frame. A success's `result` is decoded later, against the type the caller expects.
struct AckFrame: Decodable, Equatable {
    var id: String
    var ok: Bool
    var code: String?
    var details: Details?

    struct Details: Decodable, Equatable {
        var token: String?
        init(from decoder: Decoder) throws {
            token = try? decoder.container(keyedBy: Keys.self).decodeIfPresent(String.self, forKey: .token)
        }
        private enum Keys: String, CodingKey { case token }
    }

    /// The failure this ack reports (nil for a success).
    var error: AppError? {
        ok ? nil : AppError(code: code ?? "unknown", token: details?.token, underlying: nil)
    }
}

/// One frame from the game server (`ServerMsg` in `server/src/protocol.ts`).
enum ServerFrame: Decodable, Equatable {
    case welcome(Welcome)
    case state(StateFrame)
    case ack(AckFrame)
    case reclaim(id: String, status: ReclaimStatus)
    case evicted
    case error(code: String)
    /// A frame type this client does not know; ignored.
    case unknown

    private enum Keys: String, CodingKey { case t, id, status, code }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .t) {
        case "welcome": self = .welcome(try Welcome(from: decoder))
        case "state": self = .state(try StateFrame(from: decoder))
        case "ack": self = .ack(try AckFrame(from: decoder))
        case "reclaim": self = .reclaim(id: try c.decode(String.self, forKey: .id), status: try c.decode(ReclaimStatus.self, forKey: .status))
        case "evicted": self = .evicted
        case "error": self = .error(code: try c.decode(String.self, forKey: .code))
        default: self = .unknown
        }
    }
}

/// The `result` of a successful ack, decoded as `T`.
private struct ResultEnvelope<T: Decodable>: Decodable { var result: T }

/// An ack result the caller ignores (any JSON, `null` included).
struct EmptyResult: Decodable {
    init() {}
    init(from decoder: Decoder) throws {}
}

// MARK: - Transport

/// One text-frame connection to the server. `URLSessionTransport` is the real one; tests inject a fake.
protocol Transport: AnyObject, Sendable {
    /// Sends one text frame.
    func send(_ text: String) async throws
    /// The next text frame.
    /// - Throws: `TransportClosed` with the close code once the connection has ended.
    func receive() async throws -> String
    /// Drops the connection; a pending `receive` throws.
    func cancel()
}

/// The connection ended with this WebSocket close code (1006 when none was received) and close reason, if any.
struct TransportClosed: Error, Equatable {
    var code: Int
    var reason: String? = nil
}

/// `Transport` over `URLSessionWebSocketTask`.
final class URLSessionTransport: Transport, @unchecked Sendable {
    private let task: URLSessionWebSocketTask

    init(url: URL, session: URLSession) {
        task = session.webSocketTask(with: url)
        task.resume()
    }

    func send(_ text: String) async throws { try await task.send(.string(text)) }

    func receive() async throws -> String {
        do {
            switch try await task.receive() {
            case let .string(text): return text
            case let .data(data): return String(decoding: data, as: UTF8.self)
            @unknown default: return ""
            }
        } catch {
            let code = task.closeCode.rawValue
            throw TransportClosed(code: code == URLSessionWebSocketTask.CloseCode.invalid.rawValue ? 1006 : code,
                                  reason: task.closeReason.map { String(decoding: $0, as: UTF8.self) })
        }
    }

    func cancel() { task.cancel(with: .goingAway, reason: nil) }
}

// MARK: - Room

/// One reconnecting WebSocket to one game room (the web `RoomConnection`). It says `hello` on every
/// (re)connect with the last known `gameId`, merges `state` frames section by section (dropping any whose
/// `rev` is not newer than the last applied; `welcome` resets that), and runs `act`s: sent at once when
/// ready, else queued until the next `welcome` (10 s from enqueue, then `offline`). A close rejects
/// sent-but-unacked acts with `offline` and reconnects with backoff (0.5 s doubling to 8 s, ±20 %), at once
/// on `wake()` (network back) or `resume()` (foreground). Closes 4001 / 4003 / 4004 are fatal: `fatal()`
/// streams yield the error and the room stays closed. A close with reason `superseded` parks the room until
/// something needs it again. A `ping` goes out every 25 s; no `pong` within 10 s
/// drops the socket and reconnects. A socket with no `welcome` 10 s after it opened is dropped and retried the
/// same way, and a `wake()` drops one that has been handshaking for 3 s. `suspend()` (background) drops the socket and every timer.
///
/// Lifetime: the socket opens on first use. With no snapshot or reclaim stream attached and nothing
/// pending, the room closes itself after 15 s.
actor RoomConnection {
    typealias Sleeper = @Sendable (Double) async throws -> Void

    static let backoffStart = 0.5
    static let backoffMax = 8.0
    static let backoffJitter = 0.2
    static let pingEvery = 25.0
    static let pongWithin = 10.0
    /// How long an act (or hello) may wait for a ready socket before it fails `offline`.
    static let sendDeadline = 10.0
    /// How long a socket (token fetch included) may take to reach `welcome` before it is abandoned and retried.
    static let connectDeadline = 10.0
    /// A `wake()` abandons a socket that has been handshaking at least this long.
    static let wakeStall = 3.0
    /// How long a room nothing needs stays open before it closes itself.
    static let idleClose = 15.0
    /// Close codes that end the room for good (see `AppError.fromClose`).
    static let fatalCloseCodes: Set<Int> = [4001, 4003, 4004]
    /// Close reason the server gives a uid's oldest socket when a fifth one says hello: stay down, do not loop.
    static let supersededReason = "superseded"

    enum Status { case idle, connecting, ready, closed }

    private struct Waiter {
        var cont: CheckedContinuation<Welcome, Error>
        var deadline: _Concurrency.Task<Void, Never>
    }

    private struct QueuedAct {
        var id: String
        var op: String
        var frame: String
        var cont: CheckedContinuation<Data, Error>
        var deadline: _Concurrency.Task<Void, Never>
    }

    private struct Sections {
        var game: GameDoc?
        var seats: [Seat]?
        var view: [PoolViewEntry]?
        var board: BoardDoc??
        var bingos: [BingoDoc]?
        var standings: [Standing]?
        var reclaims: [Reclaim]?
        var roster: [RosterName]?
    }

    let code: String
    private let socketURL: URL
    private let tokenProvider: () async throws -> String
    private let makeTransport: (URL) -> Transport
    private let sleeper: Sleeper
    private let random: () -> Double
    private let now: () -> Double
    private let connectDeadline: Double
    /// Readable without hopping onto the actor, so a registry can tell a dead room from a live one.
    nonisolated let closedFlag = ClosedFlag()

    private(set) var status: Status = .idle
    /// The game this room says hello to (the epoch), if known.
    private(set) var gameId: String?
    /// The error that ended the room for good, if one did.
    private(set) var fatalCause: AppError?
    private var welcomedGameId: String?
    private var seatId: String?
    private var lastRev = -1
    private var sections = Sections()
    private var attempt = 0
    private var suspended = false

    private var transport: Transport?
    /// Bumped whenever the socket is replaced or dropped; callbacks from an older socket are ignored.
    private var generation = 0
    private var outbox: AsyncStream<String>.Continuation?
    private var readTask: _Concurrency.Task<Void, Never>?
    private var writeTask: _Concurrency.Task<Void, Never>?
    private var reconnectTask: _Concurrency.Task<Void, Never>?
    private var pingTask: _Concurrency.Task<Void, Never>?
    private var pongTask: _Concurrency.Task<Void, Never>?
    private var idleTask: _Concurrency.Task<Void, Never>?
    /// Abandons the current socket unless its `welcome` arrives first.
    private var connectTask: _Concurrency.Task<Void, Never>?
    /// When the current socket was opened, on the `now` clock (for the wake stall check).
    private var connectStartedAt = 0.0

    private var nextKey = 0
    private var helloWaiters: [Int: Waiter] = [:]
    private var queue: [QueuedAct] = []
    private var inFlight: [String: QueuedAct] = [:]
    private var snapshotListeners: [Int: AsyncStream<GameSnapshot>.Continuation] = [:]
    private var reclaimListeners: [Int: (id: String, cont: AsyncStream<ReclaimStatus>.Continuation)] = [:]
    private var fatalListeners: [Int: AsyncStream<AppError>.Continuation] = [:]

    /// - Parameters:
    ///   - url: the server's WebSocket base URL (`ws://` or `wss://`); the socket opens `<url>/ws/<code>`.
    ///   - code: the game's join code.
    ///   - tokenProvider: a fresh Firebase ID token for `hello`.
    ///   - session: the session that opens the socket.
    ///   - startSuspended: true when the app is in the background: nothing connects until `resume()`.
    init(url: URL, code: String, tokenProvider: @escaping () async throws -> String, session: URLSession = .shared,
         startSuspended: Bool = false) {
        self.init(url: url, code: code, tokenProvider: tokenProvider, makeTransport: { URLSessionTransport(url: $0, session: session) },
                  startSuspended: startSuspended)
    }

    /// Test seam: injects the transport, the timer sleep, the backoff jitter source (in [0, 1)), the clock
    /// (seconds) and the handshake deadline.
    init(url: URL, code: String, tokenProvider: @escaping () async throws -> String,
         makeTransport: @escaping (URL) -> Transport,
         sleeper: @escaping Sleeper = { try await _Concurrency.Task.sleep(nanoseconds: UInt64($0 * 1_000_000_000)) },
         random: @escaping () -> Double = { Double.random(in: 0..<1) },
         now: @escaping () -> Double = { ProcessInfo.processInfo.systemUptime },
         connectDeadline: Double = RoomConnection.connectDeadline,
         startSuspended: Bool = false) {
        self.code = code
        self.suspended = startSuspended
        self.socketURL = url.appendingPathComponent("ws").appendingPathComponent(code)
        self.tokenProvider = tokenProvider
        self.makeTransport = makeTransport
        self.sleeper = sleeper
        self.random = random
        self.now = now
        self.connectDeadline = connectDeadline
    }

    /// Whether the room has ended (it never reopens; ask for a new one).
    nonisolated var isClosed: Bool { closedFlag.value }

    // MARK: public API

    /// Says `hello` (again, on an open socket — how a seat granted by an approved reclaim is picked up) and
    /// returns the next `welcome`.
    /// - Parameter gameId: the game to address; nil keeps the current epoch.
    /// - Throws: the server's `error` code (e.g. `game-not-found`), a fatal close's code, or `offline` after 10 s.
    func hello(gameId: String? = nil) async throws -> Welcome {
        if let gameId { self.gameId = gameId }
        guard status != .closed else { throw AppError.offline }
        return try await withCheckedThrowingContinuation { cont in
            let key = newKey()
            helloWaiters[key] = Waiter(cont: cont, deadline: after(Self.sendDeadline) { $0.expireHello(key) })
            cancelIdle()
            if status == .ready {
                let gen = generation
                _Concurrency.Task { await self.sendHello(generation: gen) }
            } else {
                connect()
            }
        }
    }

    /// Addresses `gameId` from now on: the next hello carries it, and an already-welcomed socket says hello
    /// again (a game that does not match the room's ends it with 4004).
    func address(gameId: String) {
        guard self.gameId != gameId, status != .closed else { return }
        self.gameId = gameId
        guard status == .ready else { return }
        let gen = generation
        _Concurrency.Task { await self.sendHello(generation: gen) }
    }

    /// Runs `op` and decodes the ack's `result` as `T`.
    /// - Throws: the ack's `code` (with `details.token`), `offline` (socket dropped before the ack, or not sent
    ///   within 10 s), or `unknown` for a result that does not decode.
    func act<T: Decodable>(_ op: String, _ args: [String: Any]) async throws -> T {
        let data = try await send(op: op, args: args)
        do {
            return try JSONDecoder().decode(ResultEnvelope<T>.self, from: data).result
        } catch {
            throw AppError(code: "unknown", token: nil, underlying: error)
        }
    }

    /// Every complete merged snapshot (at once if one is already held). Ends when the room closes.
    func snapshots() -> AsyncStream<GameSnapshot> {
        let (stream, cont) = AsyncStream<GameSnapshot>.makeStream()
        guard status != .closed else { cont.finish(); return stream }
        let key = newKey()
        snapshotListeners[key] = cont
        cont.onTermination = { [weak self] _ in _Concurrency.Task { await self?.removeSnapshotListener(key) } }
        cancelIdle()
        connect()
        if let snap = snapshot() { cont.yield(snap) }
        return stream
    }

    /// Each status the server reports for reclaim `id`. Ends when the room closes.
    func reclaimStatus(id: String) -> AsyncStream<ReclaimStatus> {
        let (stream, cont) = AsyncStream<ReclaimStatus>.makeStream()
        guard status != .closed else { cont.finish(); return stream }
        let key = newKey()
        reclaimListeners[key] = (id, cont)
        cont.onTermination = { [weak self] _ in _Concurrency.Task { await self?.removeReclaimListener(key) } }
        cancelIdle()
        connect()
        return stream
    }

    /// Yields once if the room ends for good (evicted, game gone, bad token), then finishes; also finishes
    /// when the room closes for any other reason.
    func fatal() -> AsyncStream<AppError> {
        let (stream, cont) = AsyncStream<AppError>.makeStream()
        guard status != .closed else {
            if let fatalCause { cont.yield(fatalCause) }
            cont.finish()
            return stream
        }
        let key = newKey()
        fatalListeners[key] = cont
        cont.onTermination = { [weak self] _ in _Concurrency.Task { await self?.removeFatalListener(key) } }
        return stream
    }

    /// The app left the foreground: drops the socket and every timer. Sent-but-unacked acts fail `offline`;
    /// queued acts and hellos keep their deadlines.
    func suspend() {
        guard status != .closed, !suspended else { return }
        suspended = true
        dropSocket()
        cancel(&reconnectTask)
        failInFlight(AppError.offline)
        status = .idle
    }

    /// The app is back in the foreground: reconnects (saying hello with the stored `gameId`) when anything
    /// needs the room; the server then re-sends the full state.
    func resume() {
        guard status != .closed else { return }
        suspended = false
        wake()
    }

    /// The network came back: drops a handshake stalled for `wakeStall`, skips a pending backoff wait and
    /// restarts the backoff from its shortest delay.
    func wake() {
        guard status != .closed, !suspended else { return }
        if transport != nil, status != .ready, now() - connectStartedAt >= Self.wakeStall { abandon() }
        attempt = 0
        if reconnectTask != nil {
            cancel(&reconnectTask)
            connect()
        } else if transport == nil, busy {
            connect()
        } else {
            checkIdle()
        }
    }

    /// Ends the room: closes the socket, fails anything pending with `offline`, never reconnects.
    func close() {
        guard status != .closed else { return }
        shutdown(AppError.offline)
    }

    // MARK: transport

    /// Opens a socket unless one is open or opening, a backoff wait is pending, or the room is suspended / closed.
    private func connect() {
        guard status != .closed, !suspended, transport == nil, reconnectTask == nil else { return }
        generation += 1
        let gen = generation
        let t = makeTransport(socketURL)
        transport = t
        status = .connecting
        connectStartedAt = now()
        connectTask = after(connectDeadline) { room in
            room.connectTask = nil
            if gen == room.generation, room.transport != nil, room.status != .ready { room.abandon() }
        }
        let (frames, out) = AsyncStream<String>.makeStream()
        outbox = out
        // One writer per socket keeps frames in the order they were queued.
        writeTask = _Concurrency.Task { for await frame in frames { try? await t.send(frame) } }
        readTask = _Concurrency.Task {
            while true {
                do {
                    let text = try await t.receive()
                    self.received(text, generation: gen)
                } catch {
                    let closed = error as? TransportClosed
                    self.dropped(generation: gen, code: closed?.code ?? 1006, reason: closed?.reason)
                    return
                }
            }
        }
        _Concurrency.Task { await self.sendHello(generation: gen) }
    }

    /// Fetches a token and sends `hello` with the epoch, if the same socket is still open.
    private func sendHello(generation gen: Int) async {
        let token: String
        do {
            token = try await tokenProvider()
        } catch {
            // No token (e.g. auth offline): fail waiting hellos, then retry the socket with backoff for queued work.
            failHello(AppError(code: "unauthenticated", token: nil, underlying: error))
            if gen == generation, transport != nil { abandon() }
            return
        }
        guard gen == generation, transport != nil else { return }
        var frame: [String: Any] = ["t": "hello", "token": token]
        if let gameId { frame["gameId"] = gameId }
        write(Self.encode(frame))
    }

    private func write(_ text: String) { outbox?.yield(text) }

    /// Queues or sends one act and waits for its ack frame.
    private func send(op: String, args: [String: Any]) async throws -> Data {
        guard status != .closed else { throw AppError.offline }
        nextKey += 1
        let id = "a\(nextKey)"
        let frame = Self.encode(["t": "act", "id": id, "op": op, "args": args])
        return try await withCheckedThrowingContinuation { cont in
            let entry = QueuedAct(id: id, op: op, frame: frame, cont: cont,
                                  deadline: after(Self.sendDeadline) { $0.expireQueued(id) })
            cancelIdle()
            if status == .ready {
                transmit(entry)
            } else {
                queue.append(entry)
                connect()
            }
        }
    }

    private func transmit(_ entry: QueuedAct) {
        entry.deadline.cancel()
        inFlight[entry.id] = entry
        write(entry.frame)
    }

    /// The socket closed (or was abandoned): fail what was sent, then reconnect, park, or end. A `superseded`
    /// close parks the room (no backoff reconnect, so this uid's sockets cannot evict each other in a loop);
    /// the next act, hello, `wake()` or `resume()` reopens it.
    private func dropped(generation gen: Int, code: Int, reason: String? = nil) {
        guard gen == generation, transport != nil else { return }
        dropSocket()
        failInFlight(AppError.offline)
        if Self.fatalCloseCodes.contains(code) {
            fail(AppError.fromClose(code: code))
            return
        }
        guard busy else {
            // Nobody needs the room any more: end it instead of reconnecting.
            shutdown(AppError.offline)
            return
        }
        if reason == Self.supersededReason {
            status = .idle
            return
        }
        status = .connecting
        let base = min(Self.backoffStart * pow(2, Double(attempt)), Self.backoffMax)
        let delay = base * (1 + (random() * 2 - 1) * Self.backoffJitter)
        attempt += 1
        reconnectTask = after(delay) { room in
            room.reconnectTask = nil
            room.connect()
        }
    }

    /// A dead link may never deliver its close: drop the socket ourselves and reconnect.
    private func abandon() {
        transport?.cancel()
        dropped(generation: generation, code: 1006)
    }

    /// Forgets the current socket (cancelling it) and its heartbeat; later callbacks from it are ignored.
    private func dropSocket() {
        generation += 1
        transport?.cancel()
        transport = nil
        outbox?.finish()
        outbox = nil
        writeTask = nil
        readTask = nil
        cancel(&connectTask)
        stopPing()
    }

    // MARK: frames

    private func received(_ text: String, generation gen: Int) {
        guard gen == generation else { return }
        if text == "pong" {
            cancel(&pongTask)
            return
        }
        let data = Data(text.utf8)
        let frame: ServerFrame
        do {
            frame = try JSONDecoder().decode(ServerFrame.self, from: data)
        } catch {
            log.error("undecodable frame: \(error.localizedDescription)")
            return
        }
        switch frame {
        case let .welcome(w): welcome(w)
        case let .state(s): applyState(s)
        case let .ack(a): ack(a, data: data)
        case let .reclaim(id, status):
            for listener in reclaimListeners.values where listener.id == id { listener.cont.yield(status) }
        case let .error(code):
            // `try-again` precedes a 1013 close and a reconnect: a waiting hello keeps waiting for that welcome.
            if code == "try-again" { break }
            // `game-not-found` / `unauthenticated` precede their fatal close; any other code only answers a waiting hello.
            let err = AppError(code: code, token: nil, underlying: nil)
            failHello(err)
            if code == "game-not-found" || code == "unauthenticated" { fail(err) }
        case .evicted:
            // Precedes the 4003 close; ending here does not depend on the close code reaching us.
            fail(AppError.fromClose(code: 4003))
        case .unknown:
            break
        }
    }

    /// Adopts a `welcome`. Seat changes that happened while this socket was away surface here: in the same
    /// game, a seat that became nil is an eviction (fatal `permission-denied`, as 4003), and a seat that
    /// appeared while a reclaim is watched is that reclaim approved (only on a reconnect's own hello).
    private func welcome(_ w: Welcome) {
        let sameGame = welcomedGameId == w.gameId
        if welcomedGameId != nil, !sameGame { sections = Sections() }
        let prevSeat = sameGame ? seatId : nil
        welcomedGameId = w.gameId
        gameId = w.gameId
        seatId = w.seatId
        lastRev = -1
        attempt = 0
        status = .ready
        cancel(&connectTask)
        let waiters = helloWaiters.values
        helloWaiters = [:]
        for h in waiters {
            h.deadline.cancel()
            h.cont.resume(returning: w)
        }
        if prevSeat != nil, w.seatId == nil {
            fail(AppError.fromClose(code: 4003))
            return
        }
        if sameGame, prevSeat == nil, w.seatId != nil, waiters.isEmpty {
            for listener in reclaimListeners.values { listener.cont.yield(.approved) }
        }
        let queued = queue
        queue = []
        queued.forEach(transmit)
        startPing()
        checkIdle()
    }

    private func ack(_ a: AckFrame, data: Data) {
        guard let entry = inFlight.removeValue(forKey: a.id) else { return }
        if let err = a.error {
            entry.cont.resume(throwing: err)
        } else {
            if entry.op == "join" { noteJoin(data) }
            entry.cont.resume(returning: data)
        }
        checkIdle()
    }

    /// A successful `join` seats this uid: later snapshots are that seat's.
    private func noteJoin(_ data: Data) {
        guard let res = try? JSONDecoder().decode(ResultEnvelope<JoinGameRes>.self, from: data).result else { return }
        switch res {
        case let .joined(_, s), let .resumed(_, s): seatId = s
        case .reclaimPending: break
        }
    }

    /// Replaces each section the frame carries, then emits if the snapshot is complete.
    private func applyState(_ s: StateFrame) {
        guard s.rev > lastRev else { return }
        lastRev = s.rev
        if let v = s.game { sections.game = v }
        if let v = s.seats { sections.seats = v }
        if let v = s.view { sections.view = v }
        if let v = s.board { sections.board = .some(v) }
        if let v = s.bingos { sections.bingos = v }
        if let v = s.standings { sections.standings = v }
        if let v = s.reclaims { sections.reclaims = v }
        if let v = s.roster { sections.roster = v }
        guard let snap = snapshot() else { return }
        for cont in snapshotListeners.values { cont.yield(snap) }
    }

    /// The merged snapshot once game, seats, view and bingos are known and this uid holds a seat.
    private func snapshot() -> GameSnapshot? {
        guard let seatId, let game = sections.game, let seats = sections.seats, let view = sections.view,
              let bingos = sections.bingos else { return nil }
        return GameSnapshot(game: game, mySeatId: seatId, seats: seats, view: view, board: sections.board ?? nil,
                            bingos: bingos, reclaims: sections.reclaims ?? [], standings: sections.standings ?? [],
                            roster: sections.roster ?? [])
    }

    // MARK: heartbeat

    /// Pings every 25 s on the current socket; a ping unanswered for 10 s abandons it.
    private func startPing() {
        stopPing()
        let gen = generation
        pingTask = after(Self.pingEvery) { $0.ping(generation: gen) }
    }

    private func ping(generation gen: Int) {
        pingTask = nil
        guard gen == generation, transport != nil else { return }
        write("ping")
        if pongTask == nil {
            pongTask = after(Self.pongWithin) { room in
                room.pongTask = nil
                if gen == room.generation, room.transport != nil { room.abandon() }
            }
        }
        pingTask = after(Self.pingEvery) { $0.ping(generation: gen) }
    }

    private func stopPing() {
        cancel(&pingTask)
        cancel(&pongTask)
    }

    // MARK: lifetime

    private var busy: Bool {
        !snapshotListeners.isEmpty || !reclaimListeners.isEmpty || !helloWaiters.isEmpty || !queue.isEmpty || !inFlight.isEmpty
    }

    private func cancelIdle() { cancel(&idleTask) }

    /// Starts the idle-close grace period when nothing needs the room.
    private func checkIdle() {
        guard status != .closed, !busy, idleTask == nil else { return }
        idleTask = after(Self.idleClose) { room in
            room.idleTask = nil
            if !room.busy { room.close() }
        }
    }

    private func removeSnapshotListener(_ key: Int) {
        snapshotListeners[key] = nil
        checkIdle()
    }

    private func removeReclaimListener(_ key: Int) {
        reclaimListeners[key] = nil
        checkIdle()
    }

    private func removeFatalListener(_ key: Int) { fatalListeners[key] = nil }

    private func expireHello(_ key: Int) {
        guard let w = helloWaiters.removeValue(forKey: key) else { return }
        w.cont.resume(throwing: AppError.offline)
        checkIdle()
    }

    private func expireQueued(_ id: String) {
        guard let i = queue.firstIndex(where: { $0.id == id }) else { return }
        queue.remove(at: i).cont.resume(throwing: AppError.offline)
        checkIdle()
    }

    private func failHello(_ e: Error) {
        let waiters = helloWaiters.values
        helloWaiters = [:]
        for h in waiters {
            h.deadline.cancel()
            h.cont.resume(throwing: e)
        }
    }

    private func failInFlight(_ e: Error) {
        let sent = inFlight.values
        inFlight = [:]
        for entry in sent { entry.cont.resume(throwing: e) }
    }

    /// Ends the room for good with `err`: tells `fatal()` streams, then shuts down.
    private func fail(_ err: AppError) {
        guard status != .closed else { return }
        fatalCause = err
        for cont in fatalListeners.values { cont.yield(err) }
        shutdown(err)
    }

    /// Marks the room closed, fails everything pending with `err`, stops every timer and finishes every stream.
    private func shutdown(_ err: AppError) {
        status = .closed
        closedFlag.set()
        dropSocket()
        cancel(&reconnectTask)
        cancelIdle()
        failHello(err)
        for q in queue {
            q.deadline.cancel()
            q.cont.resume(throwing: err)
        }
        queue = []
        failInFlight(err)
        let snaps = snapshotListeners.values, reclaims = reclaimListeners.values, fatals = fatalListeners.values
        snapshotListeners = [:]
        reclaimListeners = [:]
        fatalListeners = [:]
        snaps.forEach { $0.finish() }
        reclaims.forEach { $0.cont.finish() }
        fatals.forEach { $0.finish() }
    }

    // MARK: helpers

    private func newKey() -> Int {
        nextKey += 1
        return nextKey
    }

    private func cancel(_ task: inout _Concurrency.Task<Void, Never>?) {
        task?.cancel()
        task = nil
    }

    /// Runs `fire` on this actor after `seconds`, unless the returned task is cancelled first. Cancellation
    /// and the check both happen on the actor, so a cancelled timer never fires.
    private func after(_ seconds: Double, _ fire: @escaping (isolated RoomConnection) -> Void) -> _Concurrency.Task<Void, Never> {
        _Concurrency.Task {
            do { try await self.sleeper(seconds) } catch { return }
            guard !_Concurrency.Task.isCancelled else { return }
            fire(self)
        }
    }

    private static func encode(_ frame: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: frame) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }
}

/// A thread-safe one-way flag.
final class ClosedFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var isSet = false
    var value: Bool { lock.withLock { isSet } }
    func set() { lock.withLock { isSet = true } }
}
