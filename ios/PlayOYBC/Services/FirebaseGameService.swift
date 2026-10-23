import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseFunctions
import Foundation

/// Bridges Firebase's `Any`-typed payloads to the Codable schema.
enum FirebaseCoding {
    static func decode<T: Decodable>(_ type: T.Type, from any: Any) throws -> T {
        let data = try JSONSerialization.data(withJSONObject: any, options: [.fragmentsAllowed])
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
    private let db: Firestore
    private let fns: Functions

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

    /// Anonymous sign-in at launch; a no-op once a user exists.
    func ensureSignedIn() async throws {
        if Auth.auth().currentUser != nil { return }
        _ = try await Auth.auth().signInAnonymously()
    }

    private func call<Req: Encodable, Res: Decodable>(_ name: String, _ req: Req, as: Res.Type) async throws -> Res {
        try await ensureSignedIn()
        let result = try await fns.httpsCallable(name).call(try FirebaseCoding.encode(req))
        return try FirebaseCoding.decode(Res.self, from: result.data)
    }

    private func callVoid<Req: Encodable>(_ name: String, _ req: Req) async throws {
        try await ensureSignedIn()
        _ = try await fns.httpsCallable(name).call(try FirebaseCoding.encode(req))
    }

    func createGame(name: String) async throws -> CreateGameRes { try await call("createGame", CreateGameReq(name: name), as: CreateGameRes.self) }
    func joinGame(code: String, name: String) async throws -> JoinGameRes { try await call("joinGame", JoinGameReq(code: code, name: name), as: JoinGameRes.self) }

    func whoAmI(code: String) async throws -> WhoAmIRes? {
        try await ensureSignedIn()
        let result = try await fns.httpsCallable("whoAmI").call(try FirebaseCoding.encode(WhoAmIReq(code: code)))
        if result.data is NSNull { return nil }
        return try FirebaseCoding.decode(WhoAmIRes.self, from: result.data)
    }

    func addTask(gameId: String, text: String) async throws { try await callVoid("addTask", AddTaskReq(gameId: gameId, text: text)) }
    func deleteTask(gameId: String, taskId: String) async throws { try await callVoid("deleteTask", DeleteTaskReq(gameId: gameId, taskId: taskId)) }
    func launch(gameId: String) async throws { try await callVoid("launchGame", LaunchGameReq(gameId: gameId)) }
    func toggleMark(gameId: String, cellIndex: Int) async throws -> ToggleMarkRes {
        try await call("toggleMark", ToggleMarkReq(gameId: gameId, cellIndex: cellIndex), as: ToggleMarkRes.self)
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
            let hub = SubscriptionHub(db: db, gameId: gameId, seatId: seatId, continuation: continuation)
            startWhenSignedIn(hub)
            continuation.onTermination = { _ in hub.stop() }
        }
    }

    private func startWhenSignedIn(_ hub: SubscriptionHub) {
        _Concurrency.Task { [weak self] in
            do {
                try await self?.ensureSignedIn()
                hub.start()
            } catch {
                hub.fail(error)
            }
        }
    }

    func watchReclaim(gameId: String, reclaimId: String) -> AsyncThrowingStream<ReclaimStatus, Error> {
        AsyncThrowingStream { continuation in
            var reg: ListenerRegistration?
            let task = _Concurrency.Task { [weak self] in
                do {
                    try await self?.ensureSignedIn()
                    guard let db = self?.db else { return }
                    reg = db.collection("games").document(gameId).collection("reclaims").document(reclaimId)
                        .addSnapshotListener { snap, error in
                            if let error { continuation.finish(throwing: error); return }
                            guard let data = snap?.data(), let doc = try? FirebaseCoding.decode(ReclaimDoc.self, from: data) else { return }
                            continuation.yield(doc.status)
                        }
                } catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel(); reg?.remove() }
        }
    }
}

/// Merges the five game listeners (plus the host-only reclaims listener) into snapshots,
/// emitting once every part has reported — the same rule as the web `subscribe`.
private final class SubscriptionHub: @unchecked Sendable {
    private let db: Firestore
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

    init(db: Firestore, gameId: String, seatId: String, continuation: AsyncThrowingStream<GameSnapshot, Error>.Continuation) {
        self.db = db; self.gameId = gameId; self.seatId = seatId; self.continuation = continuation
    }

    private var gameRef: DocumentReference { db.collection("games").document(gameId) }

    func fail(_ e: Error) {
        guard !closed else { return }
        closed = true
        continuation.finish(throwing: e)
    }

    func stop() {
        closed = true
        regs.forEach { $0.remove() }
        reclaimReg?.remove()
    }

    private func emit() {
        guard !closed, let game, let seats, let view, let board, let bingos else { return }
        continuation.yield(GameSnapshot(game: game, mySeatId: seatId, seats: seats, view: view, board: board, bingos: bingos, reclaims: reclaims))
    }

    private func decode<T: Decodable>(_ type: T.Type, _ data: [String: Any]) -> T? {
        do { return try FirebaseCoding.decode(T.self, from: data) } catch { fail(error); return nil }
    }

    func start() {
        regs.append(gameRef.addSnapshotListener { [self] snap, error in
            if let error { return fail(error) }
            guard let snap else { return }
            guard snap.exists, let data = snap.data() else {
                // A cache miss is not a missing game; only a server-confirmed absence is.
                if snap.metadata.isFromCache { return }
                return fail(GameServiceError.gameNotFound)
            }
            guard let g = decode(GameDoc.self, data) else { return }
            game = g
            setReclaimListener(isHost: g.hostSeatId == seatId)
            emit()
        })
        regs.append(gameRef.collection("seats").addSnapshotListener { [self] snap, error in
            if let error { return fail(error) }
            guard let snap else { return }
            var out: [Seat] = []
            for d in snap.documents {
                guard let doc = decode(SeatDoc.self, d.data()) else { return }
                out.append(Seat(seatId: d.documentID, doc: doc))
            }
            seats = out
            emit()
        })
        regs.append(gameRef.collection("views").document(seatId).addSnapshotListener { [self] snap, error in
            if let error { return fail(error) }
            guard let snap else { return }
            if snap.exists, let data = snap.data() {
                guard let v = decode(ViewDoc.self, data) else { return }
                view = v.entries
            } else { view = [] }
            emit()
        })
        regs.append(gameRef.collection("boards").document(seatId).addSnapshotListener { [self] snap, error in
            if let error { return fail(error) }
            guard let snap else { return }
            if snap.exists, let data = snap.data() {
                guard let b = decode(BoardDoc.self, data) else { return }
                board = .some(b)
            } else { board = .some(nil) }
            emit()
        })
        regs.append(gameRef.collection("bingos").whereField("status", isEqualTo: "announced").order(by: "seq")
            .addSnapshotListener { [self] snap, error in
                if let error { return fail(error) }
                guard let snap else { return }
                var out: [BingoDoc] = []
                for d in snap.documents {
                    guard let b = decode(BingoDoc.self, d.data()) else { return }
                    out.append(b)
                }
                bingos = out
                emit()
            })
    }

    private func setReclaimListener(isHost: Bool) {
        if isHost == hostListening { return }
        hostListening = isHost
        reclaimReg?.remove()
        reclaimReg = nil
        guard isHost else { reclaims = []; return }
        reclaimReg = gameRef.collection("reclaims").whereField("status", isEqualTo: "pending")
            .addSnapshotListener { [self] snap, error in
                if let error { return fail(error) }
                guard let snap else { return }
                var out: [Reclaim] = []
                for d in snap.documents {
                    guard let doc = decode(ReclaimDoc.self, d.data()) else { return }
                    out.append(Reclaim(id: d.documentID, doc: doc))
                }
                reclaims = out
                emit()
            }
    }
}

enum GameServiceError: Error, Equatable { case gameNotFound }
