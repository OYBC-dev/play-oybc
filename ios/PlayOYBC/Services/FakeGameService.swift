import Foundation

/// In-memory GameService for tests and previews. Drive it with `emit` / `finish`.
final class FakeGameService: GameService {
    var toggleResult: Result<ToggleMarkRes, Error> = .failure(FakeError.unset)
    /// When set, toggleMark suspends until `releaseToggle()` is called.
    var gateToggle = false
    var whoAmIResult: WhoAmIRes?
    private(set) var toggledCells: [Int] = []
    private(set) var whoAmICodes: [String] = []
    private var continuation: AsyncThrowingStream<GameSnapshot, Error>.Continuation?
    private var gate: CheckedContinuation<Void, Never>?

    enum FakeError: Error { case unset, failed }

    func emit(_ s: GameSnapshot) { continuation?.yield(s) }
    func fail(_ e: Error) { continuation?.finish(throwing: e) }
    func releaseToggle() { gate?.resume(); gate = nil }

    func createGame(name: String) async throws -> CreateGameRes { CreateGameRes(gameId: "g1", code: "ABCDE", seatId: "s1") }
    func joinGame(code: String, name: String) async throws -> JoinGameRes { .joined(gameId: "g1", seatId: "s2") }
    func whoAmI(code: String) async throws -> WhoAmIRes? { whoAmICodes.append(code); return whoAmIResult }
    func subscribe(gameId: String, seatId: String) -> AsyncThrowingStream<GameSnapshot, Error> {
        AsyncThrowingStream { self.continuation = $0 }
    }
    func addTask(gameId: String, text: String) async throws {}
    func deleteTask(gameId: String, taskId: String) async throws {}
    func launch(gameId: String) async throws {}
    func toggleMark(gameId: String, cellIndex: Int) async throws -> ToggleMarkRes {
        toggledCells.append(cellIndex)
        if gateToggle { await withCheckedContinuation { gate = $0 } }
        return try toggleResult.get()
    }
    func end(gameId: String) async throws {}
    func resolveReclaim(gameId: String, reclaimId: String, approve: Bool) async throws {}
    func transferHost(gameId: String, toSeatId: String) async throws {}
    func watchReclaim(gameId: String, reclaimId: String) -> AsyncThrowingStream<ReclaimStatus, Error> {
        AsyncThrowingStream { $0.finish() }
    }
}
