#if DEBUG
import Foundation

/// In-memory GameService for tests, previews and snapshot tests. Drive it with `emit` / `finish`.
final class FakeGameService: GameService, @unchecked Sendable {
    var toggleResult: Result<ToggleMarkRes, Error> = .failure(FakeError.unset)
    /// Per-cell results override `toggleResult`.
    var toggleResultByCell: [Int: Result<ToggleMarkRes, Error>] = [:]
    /// When set, toggleMark suspends until `releaseToggle(cell:)` is called for that cell.
    var gateToggle = false
    var whoAmIResult: WhoAmIRes?
    var whoAmIError: Error?
    var createResult: Result<CreateGameRes, Error> = .success(CreateGameRes(gameId: "g1", code: "ABCDE", seatId: "s1"))
    var joinResult: Result<JoinGameRes, Error> = .success(.joined(gameId: "g1", seatId: "s2"))
    /// Thrown by every void call (addTask, deleteTask, launch, setOptions, bindName, retireName, leaveGame, end, resolveReclaim, transferHost).
    var callError: Error?
    /// When set, bindName / retireName suspend until `releaseRoster()`.
    var gateRoster = false
    private var rosterGates: [CheckedContinuation<Void, Never>] = []
    private(set) var toggledCells: [Int] = []
    /// The `marked` value sent with each toggle, parallel to `toggledCells`.
    private(set) var toggledValues: [Bool] = []
    private(set) var whoAmICodes: [String] = []
    private(set) var joins: [(code: String, name: String, reclaim: Bool)] = []
    private(set) var calls: [String] = []
    /// How many times `subscribe` was called, and how many of those streams are still open.
    private(set) var subscribeCount = 0
    private(set) var activeSubscriptions = 0
    private var continuation: AsyncThrowingStream<GameSnapshot, Error>.Continuation?
    private var reclaimContinuation: AsyncThrowingStream<ReclaimStatus, Error>.Continuation?
    private var gates: [Int: CheckedContinuation<Void, Never>] = [:]
    /// Cells released before their toggle reached the gate; the next gated toggle for that cell passes straight through.
    private var released: Set<Int> = []

    /// toggleMark runs off the main actor and concurrently with itself; guards its shared state.
    private let lock = NSLock()

    enum FakeError: Error { case unset, failed }

    func emit(_ s: GameSnapshot) { continuation?.yield(s) }
    func fail(_ e: Error) { continuation?.finish(throwing: e) }
    func releaseToggle(cell: Int) {
        let waiting: CheckedContinuation<Void, Never>? = lock.withLock {
            if let c = gates.removeValue(forKey: cell) { return c }
            released.insert(cell)
            return nil
        }
        waiting?.resume()
    }
    func emitReclaim(_ s: ReclaimStatus) { reclaimContinuation?.yield(s) }
    func failReclaim(_ e: Error) { reclaimContinuation?.finish(throwing: e) }

    /// Records the call, then (with `gateRoster`) suspends until `releaseRoster()`, then throws `callError` if set.
    private func gatedVoid(_ name: String) async throws {
        let gated = lock.withLock { calls.append(name); return gateRoster }
        if gated { await withCheckedContinuation { c in lock.withLock { rosterGates.append(c) } } }
        if let callError { throw callError }
    }
    /// Resumes every bindName / retireName parked by `gateRoster`.
    /// How many roster calls are parked at the gate.
    var parkedRosterCalls: Int { lock.withLock { rosterGates.count } }
    func releaseRoster() {
        let waiting: [CheckedContinuation<Void, Never>] = lock.withLock { defer { rosterGates = [] }; return rosterGates }
        waiting.forEach { $0.resume() }
    }

    private func void(_ name: String) throws {
        calls.append(name)
        if let callError { throw callError }
    }

    /// The options of every `createGame` call, in order.
    private(set) var creates: [CreateGameReq] = []
    /// When set, createGame suspends until `releaseCreate()`.
    var gateCreate = false
    private var createGate: CheckedContinuation<Void, Never>?
    /// `releaseCreate()` ran before the create reached its gate.
    private var createReleased = false
    func releaseCreate() {
        let c: CheckedContinuation<Void, Never>? = lock.withLock {
            if let c = createGate { createGate = nil; return c }
            createReleased = true
            return nil
        }
        c?.resume()
    }
    func createGame(name: String, gameName: String?, freeSpace: Bool) async throws -> CreateGameRes {
        let gated = lock.withLock {
            calls.append("createGame:\(name)")
            creates.append(CreateGameReq(name: name, gameName: gameName, freeSpace: freeSpace))
            return gateCreate
        }
        if gated {
            await withCheckedContinuation { c in
                let pass: Bool = lock.withLock {
                    if createReleased { createReleased = false; return true }
                    createGate = c
                    return false
                }
                if pass { c.resume() }
            }
        }
        return try createResult.get()
    }
    func joinGame(code: String, name: String, reclaim: Bool) async throws -> JoinGameRes {
        joins.append((code, name, reclaim)); return try joinResult.get()
    }
    func whoAmI(code: String) async throws -> WhoAmIRes? {
        whoAmICodes.append(code)
        if let whoAmIError { throw whoAmIError }
        return whoAmIResult
    }
    func subscribe(gameId: String, seatId: String) -> AsyncThrowingStream<GameSnapshot, Error> {
        subscribeCount += 1
        activeSubscriptions += 1
        return AsyncThrowingStream { c in
            c.onTermination = { [weak self] _ in DispatchQueue.main.async { self?.activeSubscriptions -= 1 } }
            self.continuation = c
        }
    }
    func addTask(gameId: String, text: String) async throws { try void("addTask:\(text)") }
    func deleteTask(gameId: String, taskId: String) async throws { try void("deleteTask:\(taskId)") }
    func launch(gameId: String) async throws { try void("launch") }
    func setOptions(gameId: String, freeSpace: Bool) async throws { try void("setOptions:\(freeSpace)") }
    func bindName(gameId: String, key: String, seatId: String?) async throws {
        try await gatedVoid("bindName:\(key):\(seatId ?? "nil")")
    }
    func retireName(gameId: String, key: String) async throws { try await gatedVoid("retireName:\(key)") }
    func leaveGame(gameId: String) async throws { try void("leaveGame:\(gameId)") }
    func toggleMark(gameId: String, cellIndex: Int, marked: Bool) async throws -> ToggleMarkRes {
        let gated = lock.withLock { toggledCells.append(cellIndex); toggledValues.append(marked); return gateToggle }
        if gated {
            await withCheckedContinuation { c in
                let passThrough: Bool = lock.withLock {
                    if released.remove(cellIndex) != nil { return true }
                    gates[cellIndex] = c
                    return false
                }
                if passThrough { c.resume() }
            }
        }
        return try lock.withLock { toggleResultByCell[cellIndex] ?? toggleResult }.get()
    }
    func end(gameId: String) async throws { try void("end") }
    func resolveReclaim(gameId: String, reclaimId: String, approve: Bool) async throws { try void("resolveReclaim:\(reclaimId):\(approve)") }
    func transferHost(gameId: String, toSeatId: String) async throws { try void("transferHost:\(toSeatId)") }
    func watchReclaim(gameId: String, reclaimId: String) -> AsyncThrowingStream<ReclaimStatus, Error> {
        AsyncThrowingStream { self.reclaimContinuation = $0 }
    }
}
#endif
