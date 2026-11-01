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
    /// Server-ranked leaderboard; empty before launch or from a backend that sends none.
    var standings: [Standing] = []
    /// Names the pool mentions that no seat owns, with the host's bindings; empty from a backend that sends none.
    var roster: [RosterName] = []
}

/// The only door between UI and backend: callables for writes, listeners for reads.
protocol GameService {
    /// Creates a game with the host seated as `name`. `gameName` (trimmed, ≤ 40, nil = none) and
    /// `freeSpace` are fixed at create; the server answers `invalid-argument` on a long name.
    func createGame(name: String, gameName: String?, freeSpace: Bool) async throws -> CreateGameRes
    /// Joins as `name`. A name held by someone here (or bound by the host to someone) fails `name-taken`
    /// unless `reclaim` is true, which asks the host for that seat (the lost-phone case → `reclaimPending`).
    func joinGame(code: String, name: String, reclaim: Bool) async throws -> JoinGameRes
    /// Where this uid stands in `code`'s game (seat, game name, host name). Nil only from a backend that
    /// cannot say (the legacy callable when not seated); a missing game throws `game-not-found`.
    func whoAmI(code: String) async throws -> WhoAmIRes?
    func subscribe(gameId: String, seatId: String) -> AsyncThrowingStream<GameSnapshot, Error>
    func addTask(gameId: String, text: String) async throws
    func deleteTask(gameId: String, taskId: String) async throws
    func launch(gameId: String) async throws
    /// Host, lobby only: sets the game's options. The state frame carries the change. No UI calls it since
    /// the options moved to Game settings (`createGame`); kept while the server still accepts it.
    func setOptions(gameId: String, freeSpace: Bool) async throws
    /// Host, any stage but ended: binds roster name `key` to a seat, or unbinds it when `seatId` is nil.
    /// - Throws: `name-not-found`, `seat-not-found`, `not-host`, `game-ended`, `invalid-argument`.
    func bindName(gameId: String, key: String, seatId: String?) async throws
    /// Host, any stage but ended: drops roster name `key` (its tasks lose the `@` on that name).
    /// - Throws: `name-not-found`, `not-host`, `game-ended`, `invalid-argument`.
    func retireName(gameId: String, key: String) async throws
    /// Lobby, non-host: gives the seat up on the server (the tasks they wrote stay). The host, and any
    /// seat once play starts, never sends it: the seat stays and rejoining by code resumes it.
    /// - Throws: `wrong-stage` outside the lobby, `permission-denied` for the host or a non-member.
    func leaveGame(gameId: String) async throws
    /// Sets the square to `marked` (idempotent on retry).
    func toggleMark(gameId: String, cellIndex: Int, marked: Bool) async throws -> ToggleMarkRes
    func end(gameId: String) async throws
    func resolveReclaim(gameId: String, reclaimId: String, approve: Bool) async throws
    func transferHost(gameId: String, toSeatId: String) async throws
    func watchReclaim(gameId: String, reclaimId: String) -> AsyncThrowingStream<ReclaimStatus, Error>
}

extension GameService {
    /// A game with no name and no free space.
    func createGame(name: String) async throws -> CreateGameRes {
        try await createGame(name: name, gameName: nil, freeSpace: false)
    }
}

extension GameService {
    /// A plain join (no reclaim).
    func joinGame(code: String, name: String) async throws -> JoinGameRes {
        try await joinGame(code: code, name: name, reclaim: false)
    }
}
