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

    /// Whether Launch is enabled: nobody short and the pool is big enough.
    static func canLaunch(game: GameDoc, seats: [Seat], poolSize: Int) -> Bool {
        shortfallLines(game: game, seats: seats).isEmpty && poolSize >= GameConstants.minPoolSize
    }

    /// Seats in join order.
    static func seatsByJoin(_ seats: [Seat]) -> [Seat] { seats.sorted { $0.doc.joinedAt < $1.doc.joinedAt } }

    /// Leaderboard clock: local time as h:mm (web `Leaderboard.clock`).
    static func clock(_ at: Double, timeZone: TimeZone = .current) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let c = cal.dateComponents([.hour, .minute], from: Date(timeIntervalSince1970: at / 1000))
        let h = (c.hour ?? 0) % 12
        return "\(h == 0 ? 12 : h):\(String(format: "%02d", c.minute ?? 0))"
    }
}
