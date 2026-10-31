import Foundation

/// The lobby sheet's readiness derivations (handoff v2 §3–§4), pure so the views and tests share
/// them. `ready` is "nobody is short" in the lobby; the host's Launch gate stays
/// `LobbyLogic.canLaunch` (the same rule plus "you are the host").
struct LobbyReadiness: Equatable {
    /// One expanded-sheet player row: `{dealable} / {tasksPerBoard}`, plus `need` more when short.
    struct PlayerRow: Equatable, Identifiable {
        var seatId: String
        var name: String
        /// Join-order index (the avatar colour).
        var index: Int
        var isHost: Bool
        var dealable: Int
        var need: Int
        var id: String { seatId }
    }

    /// A summary line under the bar: red when it reports a shortfall.
    struct Line: Equatable, Hashable {
        var text: String
        var danger: Bool
    }

    let isHost: Bool
    let ready: Bool
    /// Tasks in the pool (`view.count`).
    let have: Int
    /// Tasks each board needs (`game.tasksPerBoard`).
    let target: Int
    /// Tasks still wanted: the biggest per-player shortfall (what gates Launch on the server); 0 when ready.
    let need: Int
    /// Bar fill, 0…1 (1 when ready).
    let progress: Double
    /// `{have} of {target} in the pool`, or `Pool is full` once ready.
    let label: String
    /// `Need {n} more` while filling; `Ready to launch` (host) / `Waiting on host` (player) when ready.
    let status: String
    /// Host: one red line per short player (biggest shortfall first); player: one line about themselves.
    let lines: [Line]
    /// Seats in join order with short players first (stable within each group).
    let players: [PlayerRow]

    init(snapshot: GameSnapshot) {
        let game = snapshot.game
        let seats = LobbyLogic.seatsByJoin(snapshot.seats)
        let host = game.hostSeatId == snapshot.mySeatId
        let shortBy = game.shortfalls.filter { $0.value > 0 }
        let isReady = game.stage == .lobby && shortBy.isEmpty
        isHost = host
        ready = isReady
        have = snapshot.view.count
        target = game.tasksPerBoard
        need = isReady ? 0 : (shortBy.values.max() ?? 0)
        progress = isReady ? 1 : (target > 0 ? min(1, Double(have) / Double(target)) : 0)
        label = isReady ? "Pool is full" : "\(have) of \(target) in the pool"
        status = isReady ? (host ? "Ready to launch" : "Waiting on host") : "Need \(need) more"

        let rows = seats.enumerated().map { i, seat in
            PlayerRow(seatId: seat.seatId, name: seat.name, index: i, isHost: seat.seatId == game.hostSeatId,
                      dealable: game.dealable[seat.seatId] ?? 0, need: shortBy[seat.seatId] ?? 0)
        }
        players = rows.filter { $0.need > 0 } + rows.filter { $0.need == 0 }

        if host {
            // Biggest shortfall first, then by name.
            lines = players.filter { $0.need > 0 }
                .sorted { ($0.need, $1.name) > ($1.need, $0.name) }
                .map { Line(text: "\($0.name) needs \($0.need) more", danger: true) }
        } else {
            let added = snapshot.view.filter(\.mine).count
            let mine = shortBy[snapshot.mySeatId] ?? 0
            lines = [mine > 0 ? Line(text: "You've added \(added) · \(mine) more to go", danger: true)
                              : Line(text: "You've added \(added) · all set", danger: false)]
        }
    }

    /// `{dealable} / {tasksPerBoard}` for a player row (the `· {n} more` tail is drawn separately in red).
    func count(for row: PlayerRow) -> String { "\(row.dealable) / \(target)" }

    /// The pinned host Launch label: `Launch`, or `Launch · need {n} more` while filling.
    var launchLabel: String { ready ? "Launch" : "Launch · need \(need) more" }

    /// The player's expanded footer pill: the waiting copy once ready, else `Pool needs {n} more tasks`.
    var playerFooter: String {
        ready ? "Waiting for host to start" : "Pool needs \(need) more task\(need == 1 ? "" : "s")"
    }

    /// Whether the collapsed player sheet shows the mini "Waiting for host" pill (only when ready).
    var showsPlayerWaitingMini: Bool { ready && !isHost }

    /// `{N} players · all set` (the one row the ready list collapses to).
    var allSetLabel: String { "\(players.count) player\(players.count == 1 ? "" : "s") · all set" }
}
