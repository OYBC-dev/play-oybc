import FirebaseFirestore
import FirebaseFunctions
import Foundation

/// A backend failure with the server's machine-readable `code` (and optional `token`).
struct AppError: Error, Equatable {
    var code: String
    var token: String?
    var underlying: Error?

    static func == (a: AppError, b: AppError) -> Bool { a.code == b.code && a.token == b.token }

    /// Maps a callable failure: `FunctionsErrorDetailsKey` details `{code, token}` win; otherwise
    /// the Functions error code name; a Firestore permission denial (a listener on a game this
    /// uid no longer sits in) becomes `permission-denied`; anything else becomes `unknown`.
    static func from(_ error: Error) -> AppError {
        if let e = error as? AppError { return e }
        let ns = error as NSError
        if ns.domain == FunctionsErrorDomain {
            if let d = ns.userInfo[FunctionsErrorDetailsKey] as? [String: Any], let code = d["code"] as? String {
                return AppError(code: code, token: d["token"] as? String, underlying: error)
            }
            return AppError(code: "functions/\(ns.code)", token: nil, underlying: error)
        }
        if ns.domain == FirestoreErrorDomain, ns.code == FirestoreErrorCode.permissionDenied.rawValue {
            return AppError(code: "permission-denied", token: nil, underlying: error)
        }
        return AppError(code: "unknown", token: nil, underlying: error)
    }

    static let gameNotFound = AppError(code: "game-not-found", token: nil, underlying: nil)
    /// The game server could not be reached (or the socket dropped before an answer came back).
    static let offline = AppError(code: "offline", token: nil, underlying: nil)

    /// Maps a game-server WebSocket close code: 4003 (seat taken over) → `permission-denied`,
    /// 4004 → `game-not-found`, 4001 (bad token) → `unauthenticated`; any other code → `offline`.
    static func fromClose(code: Int) -> AppError {
        switch code {
        case 4003: return AppError(code: "permission-denied", token: nil, underlying: nil)
        case 4004: return gameNotFound
        case 4001: return AppError(code: "unauthenticated", token: nil, underlying: nil)
        default: return offline
        }
    }
}
