import Foundation

/// User-facing copy for backend failures (mirrors web `game/errorMessages.ts` verbatim).
enum ErrorMessages {
    static let fallback = "Something went wrong"

    private static let messages: [String: String] = [
        "invalid-name": "Use 1–20 letters, numbers or spaces",
        "game-not-found": "No game with that code",
        "game-ended": "That game has ended",
        "reclaim-not-found": "That request is gone",
        "unknown-mention": "No one here goes by that name",
        "self-mention": "You can't mention yourself",
        "not-host": "Only the host can do that",
        "wrong-stage": "That isn't available right now",
        "not-ready": "Not everyone has enough tasks yet",
        "invalid-cell": "That square is not available",
        "unknown-seat": "That player is not in this game",
        "invalid-text": "Task text is empty or too long",
        "reclaim-cooldown": "Wait a minute before asking again",
        "name-not-found": "That name is gone",
        "seat-not-found": "That player left",
        "name-taken": "That name is taken",
    ]

    /// Copy for any error thrown by a service call.
    /// - Parameter error: the thrown error (mapped through `AppError.from`).
    /// - Returns: the message to show inline.
    static func message(for error: Error) -> String {
        let e = AppError.from(error)
        if e.code == "unknown-mention", let token = e.token, !token.isEmpty { return "No player named \(token)" }
        return messages[e.code] ?? fallback
    }

    /// Copy for a failed game listener (web `GamePage`): a permission denial means this uid
    /// lost its seat (if it was ever seated) or never had one.
    /// - Parameters:
    ///   - error: the listener failure.
    ///   - wasSeated: whether a snapshot was ever received for this seat.
    static func listenerMessage(for error: Error, wasSeated: Bool) -> String {
        guard AppError.from(error).code == "permission-denied" else { return message(for: error) }
        return wasSeated ? "You've been replaced in this game." : "You're not in this game."
    }
}
