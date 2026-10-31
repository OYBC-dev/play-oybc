import Foundation

/// Values shared with the server and the web client (`game-core` / web `lobby/constants.ts`).
enum GameConstants {
    /// Longest task text the server accepts.
    static let maxTaskLength = 120
    /// Board side length; with free space on, the FREE square sits at index 12.
    static let gridSize = 5
    /// Production web origin the join link and QR point at.
    static let webOrigin = "https://play-oybc.web.app"

    /// The shareable join link for a game code.
    static func joinLink(code: String) -> String { "\(webOrigin)/g/\(code)" }
}
