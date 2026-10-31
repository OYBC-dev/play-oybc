import Foundation

/// Pure lobby derivations shared by the views and tests.
enum LobbyLogic {
    /// Host-only shortfall copy, e.g. "Cody needs 3 more tasks", sorted (web `LaunchBar`).
    static func shortfallLines(game: GameDoc, seats: [Seat]) -> [String] {
        let names = Dictionary(seats.map { ($0.seatId, $0.name) }, uniquingKeysWith: { a, _ in a })
        return game.shortfalls.filter { $0.value > 0 }
            .map { "\(names[$0.key] ?? "Someone") needs \($0.value) more task\($0.value == 1 ? "" : "s")" }
            .sorted()
    }

    /// Whether Launch is enabled: the host, in the lobby, with nobody short.
    static func canLaunch(game: GameDoc, seats: [Seat], isHost: Bool) -> Bool {
        isHost && game.stage == .lobby && shortfallLines(game: game, seats: seats).isEmpty
    }

    /// The lobby count, "{dealable to me} / {tasks per board}", e.g. "18 / 25".
    static func poolCount(game: GameDoc, mySeatId: String) -> String {
        "\(game.dealable[mySeatId] ?? 0) / \(game.tasksPerBoard)"
    }

    /// Roster names nobody carries yet, in roster order (the dashed chips, the menu's Roster count
    /// and the names the Launch confirm lists).
    /// - Parameter roster: the snapshot's roster.
    /// - Returns: the names whose `seatId` is nil.
    static func unboundRosterNames(_ roster: [RosterName]) -> [RosterName] { roster.filter { $0.seatId == nil } }

    /// Seats in join order.
    static func seatsByJoin(_ seats: [Seat]) -> [Seat] { seats.sorted { $0.doc.joinedAt < $1.doc.joinedAt } }

    /// Leaderboard pill, "1 bingo" / "3 bingos"; nil at 0 (no pill).
    static func bingoPill(_ n: Int) -> String? { n > 0 ? "\(n) bingo\(n == 1 ? "" : "s")" : nil }

    /// Leaderboard meta line: "{marked} squares" ("1 square"), plus " · {bestLine} in a row" before a first bingo.
    static func standingMeta(_ s: Standing) -> String {
        "\(s.marked) square\(s.marked == 1 ? "" : "s")" + (s.bingos == 0 ? " · \(s.bestLine) in a row" : "")
    }
}
