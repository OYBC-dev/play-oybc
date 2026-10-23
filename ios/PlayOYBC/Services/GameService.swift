import Foundation

/// Everything one seat can see of a game, merged from the server's listeners.
struct GameSnapshot: Equatable {
    var game: GameDoc
    var mySeatId: String
    var seats: [Seat]
    var view: [PoolViewEntry]
    var board: BoardDoc?
    var bingos: [BingoDoc]
    /// Pending reclaims; only populated while this seat is the host.
    var reclaims: [Reclaim]
}

/// The only door between UI and backend: callables for writes, listeners for reads.
protocol GameService {
    func createGame(name: String) async throws -> CreateGameRes
    func joinGame(code: String, name: String) async throws -> JoinGameRes
    func whoAmI(code: String) async throws -> WhoAmIRes?
    func subscribe(gameId: String, seatId: String) -> AsyncThrowingStream<GameSnapshot, Error>
    func addTask(gameId: String, text: String) async throws
    func deleteTask(gameId: String, taskId: String) async throws
    func launch(gameId: String) async throws
    func toggleMark(gameId: String, cellIndex: Int) async throws -> ToggleMarkRes
    func end(gameId: String) async throws
    func resolveReclaim(gameId: String, reclaimId: String, approve: Bool) async throws
    func transferHost(gameId: String, toSeatId: String) async throws
    func watchReclaim(gameId: String, reclaimId: String) -> AsyncThrowingStream<ReclaimStatus, Error>
}
