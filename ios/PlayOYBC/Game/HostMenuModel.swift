import Foundation

/// What the host dots menu offers for one snapshot (web `HostMenu`). Pure, so the
/// rules are unit-testable without a view.
struct HostMenuModel: Equatable {
    /// This seat hosts the game.
    let isHost: Bool
    /// Every other seated player, in join order: the "Make host" candidates.
    let candidates: [Seat]
    /// "End game" is offered (the board only: the server ends a playing game only).
    let canEnd: Bool

    /// - Parameters:
    ///   - snapshot: The game as this seat sees it.
    ///   - canEnd: Offer "End game" (true on the board, false in the lobby).
    init(snapshot: GameSnapshot, canEnd: Bool) {
        isHost = snapshot.game.hostSeatId == snapshot.mySeatId
        candidates = LobbyLogic.seatsByJoin(snapshot.seats).filter { $0.seatId != snapshot.mySeatId }
        self.canEnd = canEnd
    }

    /// The dots button shows for the host when it has something to offer: the board always
    /// (End game), the lobby only once another player has joined.
    var showsButton: Bool { isHost && (canEnd || !candidates.isEmpty) }

    /// "Make host" is disabled, not hidden, when nobody else is seated.
    var makeHostEnabled: Bool { !candidates.isEmpty }

    /// "End game" is listed.
    var showsEndGame: Bool { canEnd }
}

/// What the host menu currently has open.
enum HostMenuStage: Equatable {
    case menu
    case makeHost
    case endGame
}
