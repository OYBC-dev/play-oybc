import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseFunctions
import Foundation
import os

private let log = Logger(subsystem: "com.oybc.PlayOYBC", category: "firebase")

/// Bridges Firebase's `Any`-typed payloads to the Codable schema.
enum FirebaseCoding {
    /// Throws (never crashes) on a payload that is not valid JSON, e.g. one holding a Timestamp.
    static func decode<T: Decodable>(_ type: T.Type, from any: Any) throws -> T {
        guard JSONSerialization.isValidJSONObject(any) else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "payload is not a JSON object"))
        }
        let data = try JSONSerialization.data(withJSONObject: any)
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func encode<T: Encodable>(_ value: T) throws -> Any {
        let data = try JSONEncoder().encode(value)
        return try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
}

/// Real GameService: callables for writes, Firestore listeners for reads.
final class FirebaseGameService: GameService {
    static let region = "us-central1"
    static let shared = FirebaseGameService()
    private let db: Firestore
    private let fns: Functions
    private let gate = AuthGate()

    /// Configures Firebase once. `-useEmulators YES` points auth/firestore/functions at localhost.
    static func configure(useEmulators: Bool = UserDefaults.standard.bool(forKey: "useEmulators")) {
        guard FirebaseApp.app() == nil else { return }
        FirebaseApp.configure()
        guard useEmulators else { return }
        Auth.auth().useEmulator(withHost: "127.0.0.1", port: 9099)
        let settings = Firestore.firestore().settings
        settings.host = "127.0.0.1:8080"
        settings.isSSLEnabled = false
        settings.cacheSettings = MemoryCacheSettings()
        Firestore.firestore().settings = settings
        Functions.functions(region: region).useEmulator(withHost: "127.0.0.1", port: 5001)
    }

    init() {
        db = Firestore.firestore()
        fns = Functions.functions(region: Self.region)
    }

    /// Anonymous sign-in; concurrent callers share one flight.
    func ensureSignedIn() async throws { try await gate.ensureSignedIn() }

    private func invoke(_ name: String, _ payload: Any) async throws -> Any {
        try await ensureSignedIn()
        do { return try await fns.httpsCallable(name).call(payload).data } catch { throw AppError.from(error) }
    }

    private func call<Req: Encodable, Res: Decodable>(_ name: String, _ req: Req, as: Res.Type) async throws -> Res {
        try FirebaseCoding.decode(Res.self, from: try await invoke(name, try FirebaseCoding.encode(req)))
    }

    private func callVoid<Req: Encodable>(_ name: String, _ req: Req) async throws {
        _ = try await invoke(name, try FirebaseCoding.encode(req))
    }

    func createGame(name: String) async throws -> CreateGameRes { try await call("createGame", CreateGameReq(name: name), as: CreateGameRes.self) }
    func joinGame(code: String, name: String) async throws -> JoinGameRes { try await call("joinGame", JoinGameReq(code: code, name: name), as: JoinGameRes.self) }

    func whoAmI(code: String) async throws -> WhoAmIRes? {
        let data = try await invoke("whoAmI", try FirebaseCoding.encode(WhoAmIReq(code: code)))
        if data is NSNull { return nil }
        return try FirebaseCoding.decode(WhoAmIRes.self, from: data)
    }

    func addTask(gameId: String, text: String) async throws { try await callVoid("addTask", AddTaskReq(gameId: gameId, text: text)) }
    func deleteTask(gameId: String, taskId: String) async throws { try await callVoid("deleteTask", DeleteTaskReq(gameId: gameId, taskId: taskId)) }
    func launch(gameId: String) async throws { try await callVoid("launchGame", LaunchGameReq(gameId: gameId)) }
    func toggleMark(gameId: String, cellIndex: Int, marked: Bool) async throws -> ToggleMarkRes {
        try await call("toggleMark", ToggleMarkReq(gameId: gameId, cellIndex: cellIndex, marked: marked), as: ToggleMarkRes.self)
    }
    func end(gameId: String) async throws { try await callVoid("endGame", EndGameReq(gameId: gameId)) }
    func resolveReclaim(gameId: String, reclaimId: String, approve: Bool) async throws {
        try await callVoid("resolveReclaim", ResolveReclaimReq(gameId: gameId, reclaimId: reclaimId, approve: approve))
    }
    func transferHost(gameId: String, toSeatId: String) async throws {
        try await callVoid("transferHost", TransferHostReq(gameId: gameId, toSeatId: toSeatId))
    }

    // MARK: listeners

    func subscribe(gameId: String, seatId: String) -> AsyncThrowingStream<GameSnapshot, Error> {
        AsyncThrowingStream { continuation in
            let setup = _Concurrency.Task { @MainActor [weak self] in
                guard let self, !_Concurrency.Task.isCancelled else { continuation.finish(); return }
                let hub = SubscriptionHub(db: self.db, gameId: gameId, seatId: seatId, continuation: continuation)
                continuation.onTermination = { _ in _Concurrency.Task { @MainActor in hub.stop() } }
                // Terminated before the handler above was installed: nothing will call it.
                if _Concurrency.Task.isCancelled { hub.stop(); return }
                do {
                    try await self.ensureSignedIn()
                    hub.start()
                } catch {
                    hub.fail(AppError.from(error))
                }
            }
            continuation.onTermination = { _ in setup.cancel() }
        }
    }

    func watchReclaim(gameId: String, reclaimId: String) -> AsyncThrowingStream<ReclaimStatus, Error> {
        AsyncThrowingStream { continuation in
            let setup = _Concurrency.Task { @MainActor [weak self] in
                guard let self, !_Concurrency.Task.isCancelled else { continuation.finish(); return }
                let watcher = ReclaimWatcher(db: self.db, gameId: gameId, reclaimId: reclaimId, continuation: continuation)
                continuation.onTermination = { _ in _Concurrency.Task { @MainActor in watcher.stop() } }
                if _Concurrency.Task.isCancelled { watcher.stop(); return }
                do {
                    try await self.ensureSignedIn()
                    watcher.start()
                } catch { watcher.fail(AppError.from(error)) }
            }
            continuation.onTermination = { _ in setup.cancel() }
        }
    }
}

/// Listens to one reclaim doc. Main-actor confined; attaches nothing if stopped before sign-in finished.
@MainActor
private final class ReclaimWatcher {
    private let db: Firestore
    private let gameId: String
    private let reclaimId: String
    private let continuation: AsyncThrowingStream<ReclaimStatus, Error>.Continuation
    private var reg: ListenerRegistration?
    private var closed = false

    init(db: Firestore, gameId: String, reclaimId: String, continuation: AsyncThrowingStream<ReclaimStatus, Error>.Continuation) {
        self.db = db; self.gameId = gameId; self.reclaimId = reclaimId; self.continuation = continuation
    }

    func start() {
        guard !closed else { return }
        reg = db.collection("games").document(gameId).collection("reclaims").document(reclaimId)
            .addSnapshotListener { [self] snap, error in
                MainActor.assumeIsolated {
                    if let error { return fail(AppError.from(error)) }
                    guard !closed, let data = snap?.data() else { return }
                    do { continuation.yield(try FirebaseCoding.decode(ReclaimDoc.self, from: data).status) }
                    catch { log.error("malformed reclaim doc: \(error.localizedDescription)") }
                }
            }
    }

    func fail(_ e: Error) {
        guard !closed else { return }
        stop()
        continuation.finish(throwing: e)
    }

    func stop() {
        closed = true
        reg?.remove()
        reg = nil
    }
}

/// Merges the five game listeners (plus the host-only reclaims listener) into snapshots,
/// emitting once every part has reported (the web `subscribe` rule). Main-actor confined;
/// Firestore delivers listener callbacks on the main queue. Any listener error ends the stream
/// except the host-only reclaims listener's, which only clears the reclaim prompts.
/// Internal (not private) so tests can drive the `…Changed` / `…Failed` entry points without Firestore.
@MainActor
final class SubscriptionHub {
    /// Nil only in tests, which never call `start()`; no listener is attached without it.
    private let db: Firestore?
    private let gameId: String
    private let seatId: String
    private let continuation: AsyncThrowingStream<GameSnapshot, Error>.Continuation
    private var regs: [ListenerRegistration] = []
    private var reclaimReg: ListenerRegistration?
    private var hostListening = false
    private var closed = false

    private var game: GameDoc?
    private var seats: [Seat]?
    private var view: [PoolViewEntry]?
    private var board: BoardDoc??
    private var bingos: [BingoDoc]?
    private var reclaims: [Reclaim] = []

    init(db: Firestore?, gameId: String, seatId: String, continuation: AsyncThrowingStream<GameSnapshot, Error>.Continuation) {
        self.db = db; self.gameId = gameId; self.seatId = seatId; self.continuation = continuation
    }

    private var gameRef: DocumentReference? { db?.collection("games").document(gameId) }

    /// A new game doc: re-evaluates host status (attaching or dropping the reclaims listener).
    func gameChanged(_ g: GameDoc) {
        game = g
        setReclaimListener(isHost: g.hostSeatId == seatId)
        emit()
    }

    /// The host's pending reclaims.
    func reclaimsChanged(_ r: [Reclaim]) {
        reclaims = r
        emit()
    }

    #if DEBUG
    /// Tests only: fills the non-game parts so the next change emits.
    func seedForTesting(seats: [Seat], view: [PoolViewEntry], board: BoardDoc?, bingos: [BingoDoc]) {
        self.seats = seats; self.view = view; self.board = .some(board); self.bingos = bingos
    }

    /// Tests only: a fatal listener error (any listener but reclaims).
    func listenerFailedForTesting(_ e: Error) { fail(e) }
    #endif

    /// The host-only reclaims listener failed: drop the prompts and keep the game running.
    func reclaimsFailed(_ e: Error) {
        guard !closed else { return }
        log.error("reclaims listener failed: \(e.localizedDescription)")
        reclaims = []
        emit()
    }

    func fail(_ e: Error) {
        guard !closed else { return }
        stop()
        continuation.finish(throwing: e)
    }

    func stop() {
        closed = true
        regs.forEach { $0.remove() }
        regs = []
        reclaimReg?.remove()
        reclaimReg = nil
    }

    private func emit() {
        guard !closed, let game, let seats, let view, let board, let bingos else { return }
        continuation.yield(GameSnapshot(game: game, mySeatId: seatId, seats: seats, view: view, board: board, bingos: bingos, reclaims: reclaims))
    }

    /// Decodes one doc of a collection; a malformed doc is skipped and logged, not fatal.
    private func decodeLenient<T: Decodable>(_ type: T.Type, _ d: QueryDocumentSnapshot) -> T? {
        do { return try FirebaseCoding.decode(T.self, from: d.data()) } catch {
            log.error("skipping malformed \(d.reference.path): \(error.localizedDescription)")
            return nil
        }
    }

    /// Wraps a listener so errors go to `onError` (default: fail the stream) and callbacks run main-isolated.
    private func listen<S>(onError: ((Error) -> Void)? = nil, _ handler: @escaping (S) -> Void) -> (S?, Error?) -> Void {
        { [self] value, error in
            MainActor.assumeIsolated {
                if let error { return (onError ?? { self.fail($0) })(AppError.from(error)) }
                guard !closed, let value else { return }
                handler(value)
            }
        }
    }

    func start() {
        guard !closed, let gameRef else { return }
        regs.append(gameRef.addSnapshotListener(listen { [self] (snap: DocumentSnapshot) in
            guard snap.exists, let data = snap.data() else {
                // A cache miss is not a missing game; only a server-confirmed absence is.
                if snap.metadata.isFromCache { return }
                return fail(AppError.gameNotFound)
            }
            do {
                gameChanged(try FirebaseCoding.decode(GameDoc.self, from: data))
            } catch { fail(error) }
        }))
        regs.append(gameRef.collection("seats").addSnapshotListener(listen { [self] (snap: QuerySnapshot) in
            seats = snap.documents.compactMap { d in decodeLenient(SeatDoc.self, d).map { Seat(seatId: d.documentID, doc: $0) } }
            emit()
        }))
        regs.append(gameRef.collection("views").document(seatId).addSnapshotListener(listen { [self] (snap: DocumentSnapshot) in
            if snap.exists, let data = snap.data() {
                do { view = try FirebaseCoding.decode(ViewDoc.self, from: data).entries } catch { return fail(error) }
            } else { view = [] }
            emit()
        }))
        regs.append(gameRef.collection("boards").document(seatId).addSnapshotListener(listen { [self] (snap: DocumentSnapshot) in
            if snap.exists, let data = snap.data() {
                do { board = .some(try FirebaseCoding.decode(BoardDoc.self, from: data)) } catch { return fail(error) }
            } else { board = .some(nil) }
            emit()
        }))
        regs.append(gameRef.collection("bingos").whereField("status", isEqualTo: "announced").order(by: "seq")
            .addSnapshotListener(listen { [self] (snap: QuerySnapshot) in
                bingos = snap.documents.compactMap { decodeLenient(BingoDoc.self, $0) }
                emit()
            }))
    }

    private func setReclaimListener(isHost: Bool) {
        if isHost == hostListening { return }
        hostListening = isHost
        reclaimReg?.remove()
        reclaimReg = nil
        guard isHost else { reclaims = []; return }
        reclaimReg = gameRef?.collection("reclaims").whereField("status", isEqualTo: "pending")
            .addSnapshotListener(listen(onError: { [self] in reclaimsFailed($0) }) { [self] (snap: QuerySnapshot) in
                reclaimsChanged(snap.documents.compactMap { d in decodeLenient(ReclaimDoc.self, d).map { Reclaim(id: d.documentID, doc: $0) } })
            })
    }
}
