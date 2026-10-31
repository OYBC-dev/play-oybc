import Foundation

/// What the game dots menu offers one seat for one snapshot (web `HostMenu`): every seat gets
/// "Leave game"; the host also gets "Make host" and, where offered, "End game". Pure, so the
/// rules are unit-testable without a view.
struct HostMenuModel: Equatable {
    /// This seat hosts the game.
    let isHost: Bool
    /// Every other seated player, in join order: the "Make host" candidates.
    let candidates: [Seat]
    /// The screen offers "End game" to the host (the server ends a game from the lobby or while playing).
    let canEnd: Bool
    /// The game is still in the lobby (the End game confirm leaves out the in-play line).
    let inLobby: Bool
    /// The game has roster names (the Roster item shows only then).
    let hasRoster: Bool
    /// Roster names nobody carries yet (the Roster item's count bubble; hidden at 0).
    let unboundCount: Int

    /// - Parameters:
    ///   - snapshot: The game as this seat sees it.
    ///   - canEnd: Offer the host "End game" (true in the lobby and on the board).
    init(snapshot: GameSnapshot, canEnd: Bool) {
        isHost = snapshot.game.hostSeatId == snapshot.mySeatId
        candidates = LobbyLogic.seatsByJoin(snapshot.seats).filter { $0.seatId != snapshot.mySeatId }
        self.canEnd = canEnd
        inLobby = snapshot.game.stage == .lobby
        hasRoster = !snapshot.roster.isEmpty
        unboundCount = LobbyLogic.unboundRosterNames(snapshot.roster).count
    }

    /// The dots button shows for every seat: everyone can leave.
    var showsButton: Bool { true }

    /// "Make host" is listed (host only).
    var showsMakeHost: Bool { isHost }

    /// "Make host" is disabled, not hidden, when nobody else is seated.
    var makeHostEnabled: Bool { !candidates.isEmpty }

    /// "Roster" is listed: host only, in the lobby (roster edits stop at launch), once the pool
    /// mentions a name.
    var showsRoster: Bool { isHost && inLobby && hasRoster }

    /// "End game" is listed (host only, where the screen offers it).
    var showsEndGame: Bool { isHost && canEnd }

    /// "Leave game" is listed: always, for every seat.
    var showsLeave: Bool { true }
}

/// What the host menu currently has open.
enum HostMenuStage: Equatable {
    case menu
    case makeHost
    case endGame
}
