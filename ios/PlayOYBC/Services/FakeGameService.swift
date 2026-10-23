import Foundation

/// In-memory GameService for tests, previews and snapshot tests. Drive it with `emit` / `finish`.
final class FakeGameService: GameService {
    var toggleResult: Result<ToggleMarkRes, Error> = .failure(FakeError.unset)
    /// Per-cell results override `toggleResult`.
    var toggleResultByCell: [Int: Result<ToggleMarkRes, Error>] = [:]
    /// When set, toggleMark suspends until `releaseToggle(cell:)` is called for that cell.
    var gateToggle = false
    var whoAmIResult: WhoAmIRes?
    var whoAmIError: Error?
    var createResult: Result<CreateGameRes, Error> = .success(CreateGameRes(gameId: "g1", code: "ABCDE", seatId: "s1"))
    var joinResult: Result<JoinGameRes, Error> = .success(.joined(gameId: "g1", seatId: "s2"))
    /// Thrown by every void call (addTask, deleteTask, launch, end, resolveReclaim, transferHost).
    var callError: Error?
    private(set) var toggledCells: [Int] = []
    private(set) var whoAmICodes: [String] = []
    private(set) var joins: [(code: String, name: String)] = []
    private(set) var calls: [String] = []
    private var continuation: AsyncThrowingStream<GameSnapshot, Error>.Continuation?
    private var reclaimContinuation: AsyncThrowingStream<ReclaimStatus, Error>.Continuation?
    private var gates: [Int: CheckedContinuation<Void, Never>] = [:]

    enum FakeError: Error { case unset, failed }

    func emit(_ s: GameSnapshot) { continuation?.yield(s) }
    func fail(_ e: Error) { continuation?.finish(throwing: e) }
    func releaseToggle(cell: Int) { gates.removeValue(forKey: cell)?.resume() }
    func emitReclaim(_ s: ReclaimStatus) { reclaimContinuation?.yield(s) }
    func failReclaim(_ e: Error) { reclaimContinuation?.finish(throwing: e) }

    private func void(_ name: String) throws {
        calls.append(name)
        if let callError { throw callError }
    }

    func createGame(name: String) async throws -> CreateGameRes { calls.append("createGame:\(name)"); return try createResult.get() }
    func joinGame(code: String, name: String) async throws -> JoinGameRes { joins.append((code, name)); return try joinResult.get() }
    func whoAmI(code: String) async throws -> WhoAmIRes? {
        whoAmICodes.append(code)
        if let whoAmIError { throw whoAmIError }
        return whoAmIResult
    }
    func subscribe(gameId: String, seatId: String) -> AsyncThrowingStream<GameSnapshot, Error> {
        AsyncThrowingStream { self.continuation = $0 }
    }
    func addTask(gameId: String, text: String) async throws { try void("addTask:\(text)") }
    func deleteTask(gameId: String, taskId: String) async throws { try void("deleteTask:\(taskId)") }
    func launch(gameId: String) async throws { try void("launch") }
    func toggleMark(gameId: String, cellIndex: Int) async throws -> ToggleMarkRes {
        toggledCells.append(cellIndex)
        if gateToggle { await withCheckedContinuation { gates[cellIndex] = $0 } }
        return try (toggleResultByCell[cellIndex] ?? toggleResult).get()
    }
    func end(gameId: String) async throws { try void("end") }
    func resolveReclaim(gameId: String, reclaimId: String, approve: Bool) async throws { try void("resolveReclaim:\(reclaimId):\(approve)") }
    func transferHost(gameId: String, toSeatId: String) async throws { try void("transferHost:\(toSeatId)") }
    func watchReclaim(gameId: String, reclaimId: String) -> AsyncThrowingStream<ReclaimStatus, Error> {
        AsyncThrowingStream { self.reclaimContinuation = $0 }
    }
}
