import Foundation
@testable import PlayOYBC

/// Deterministic game data for snapshot tests. Times are fixed epoch ms; render in UTC.
enum SnapshotFixtures {
    /// 2026-10-31 21:00:00 UTC.
    static let fixedNow: Double = 1_793_480_400_000
    static let utc = TimeZone(identifier: "UTC")!

    static let seats: [Seat] = [
        Seat(seatId: "s1", doc: SeatDoc(name: "Stephen", nameKey: "stephen", joinedAt: fixedNow)),
        Seat(seatId: "s2", doc: SeatDoc(name: "Cody", nameKey: "cody", joinedAt: fixedNow + 1000)),
        Seat(seatId: "s3", doc: SeatDoc(name: "Pat", nameKey: "pat", joinedAt: fixedNow + 2000)),
        Seat(seatId: "s4", doc: SeatDoc(name: "Mary Jane", nameKey: "mary jane", joinedAt: fixedNow + 3000)),
    ]

    static func game(stage: Stage, shortfalls: [String: Int] = [:]) -> GameDoc {
        GameDoc(code: "HX7KQ", stage: stage, hostSeatId: "s1", createdAt: fixedNow, launchedAt: stage == .lobby ? nil : fixedNow + 60_000,
                endedAt: stage == .ended ? fixedNow + 3_600_000 : nil, bingoCount: 3, shortfalls: shortfalls, reviewGate: false)
    }

    /// Pool as seen by `viewer`; the entry mentioning the viewer arrives without text.
    static func pool(viewer: String) -> [PoolViewEntry] {
        [
            PoolViewEntry(taskId: "t1", authorName: "Stephen", text: "Someone bobs for apples", mine: viewer == "s1"),
            PoolViewEntry(taskId: "t2", authorName: "Cody", text: nil, mine: false),
            PoolViewEntry(taskId: "t3", authorName: "Pat", text: "A costume needs emergency tape repair", mine: viewer == "s3"),
            PoolViewEntry(taskId: "t4", authorName: "Mary Jane", text: "@Cody does the Monster Mash", mine: viewer == "s4"),
            PoolViewEntry(taskId: "t5", authorName: "Cody", text: "The dog steals candy", mine: viewer == "s2"),
            PoolViewEntry(taskId: "t6", authorName: "Stephen", text: "Fog machine sets off the smoke alarm", mine: viewer == "s1"),
        ]
    }

    static func lobby(mySeatId: String) -> GameSnapshot {
        GameSnapshot(game: game(stage: .lobby, shortfalls: ["s1": 0, "s2": 3, "s3": 1, "s4": 2]), mySeatId: mySeatId, seats: seats,
                     view: pool(viewer: mySeatId), board: nil, bingos: [], reclaims: [])
    }

    /// Just opened: only the host, an empty pool, nobody short yet.
    static func lobbyEmpty() -> GameSnapshot {
        GameSnapshot(game: game(stage: .lobby), mySeatId: "s1", seats: [seats[0]], view: [], board: nil, bingos: [], reclaims: [])
    }

    /// A 29-character name (past Join's 20 cap, a worst case): wraps in the sheet's shortfall block.
    static let longNameSeat = Seat(seatId: "s5", doc: SeatDoc(name: "Bartholomew Fitzgerald-Smythe", nameKey: "bartholomew fitzgerald-smythe",
                                                              joinedAt: fixedNow + 4000))

    /// A task at the 120-character maximum.
    static let maxLengthTask = "Someone attempts the full Thriller dance in the kitchen, knocks over the candy bowl, then says it was part of the show!!"

    /// Filling up: five players, four short (more lines than the sheet shows), a max-length row.
    static func lobbyFilling() -> GameSnapshot {
        let view = [PoolViewEntry(taskId: "t0", authorName: "Bartholomew Fitzgerald-Smythe", text: maxLengthTask, mine: false)] + pool(viewer: "s1")
        return GameSnapshot(game: game(stage: .lobby, shortfalls: ["s1": 0, "s2": 3, "s3": 1, "s4": 12, "s5": 7]), mySeatId: "s1",
                            seats: seats + [longNameSeat], view: view, board: nil, bingos: [], reclaims: [])
    }

    /// Ready to launch: a full pool and nobody short.
    static func lobbyReady() -> GameSnapshot {
        let authors = seats.map(\.name)
        let view = taskTexts.enumerated().map { i, text in
            PoolViewEntry(taskId: "r\(i)", authorName: authors[i % authors.count], text: i == 3 ? nil : text, mine: i % authors.count == 0)
        }
        return GameSnapshot(game: game(stage: .lobby, shortfalls: ["s1": 0, "s2": 0, "s3": 0, "s4": 0]), mySeatId: "s1", seats: seats,
                            view: view, board: nil, bingos: [], reclaims: [])
    }

    static let taskTexts = [
        "Someone bobs for apples", "Fog machine sets off the smoke alarm", "A costume needs emergency tape repair",
        "The dog steals candy", "Two people in the same costume", "Monster Mash plays", "Someone trips on a cape",
        "A pumpkin gets knocked over", "Cody does the Monster Mash", "Neighbor rings the doorbell",
        "Someone asks 'what are you supposed to be?'", "Fake blood on the couch", "A mask comes off for good",
        "Thriller dance breaks out", "Candy bowl runs empty", "Someone screams at a decoration",
        "Group photo takes five tries", "A wig ends up on the dog", "Ghost story told badly",
        "Someone leaves before midnight", "Pizza arrives late", "Glow stick snapped too early",
        "Somebody wins the costume contest twice", "Spider prop falls from the ceiling",
    ]

    /// A board with row 0 complete (highlighted) plus a few stray marks.
    static func board(lines: [String] = ["row_0"], extraMarks: [Int] = [7, 13, 21]) -> BoardDoc {
        var cells: [BoardCell] = []
        var t = 0
        for i in 0..<25 {
            if i == 12 { cells.append(.free) } else { cells.append(.task(taskId: "b\(i)", text: taskTexts[t])); t += 1 }
        }
        var marks = [Bool](repeating: false, count: 25)
        marks[12] = true
        for l in lines { for i in BoardLines.cells(of: l) { marks[i] = true } }
        for i in extraMarks { marks[i] = true }
        return BoardDoc(cells: cells, marks: marks, completedLines: lines, announcedLines: lines)
    }

    static let bingos: [BingoDoc] = [
        BingoDoc(seq: 1, seatId: "s3", name: "Pat", line: "col_2", playerBingoNumber: 1, at: fixedNow + 900_000, status: .announced),
        BingoDoc(seq: 2, seatId: "s1", name: "Stephen", line: "row_0", playerBingoNumber: 1, at: fixedNow + 1_260_000, status: .announced),
        BingoDoc(seq: 3, seatId: "s4", name: "Mary Jane", line: "diag_main", playerBingoNumber: 1, at: fixedNow + 2_400_000, status: .announced),
        BingoDoc(seq: 4, seatId: "s3", name: "Pat", line: "row_4", playerBingoNumber: 2, at: fixedNow + 3_000_000, status: .announced),
    ]

    /// Every task square at the 120-character maximum (the clamp check).
    static func longTextBoard() -> BoardDoc {
        var b = board()
        b.cells = b.cells.enumerated().map { i, c in c == .free ? c : .task(taskId: "l\(i)", text: maxLengthTask) }
        return b
    }

    static func playing(mySeatId: String = "s1") -> GameSnapshot {
        GameSnapshot(game: game(stage: .playing), mySeatId: mySeatId, seats: seats, view: [], board: board(),
                     bingos: Array(bingos.prefix(3)), reclaims: [])
    }

    static func ended(mySeatId: String = "s1") -> GameSnapshot {
        GameSnapshot(game: game(stage: .ended), mySeatId: mySeatId, seats: seats, view: [],
                     board: board(lines: ["row_0", "col_0"], extraMarks: [7, 13]), bingos: bingos, reclaims: [])
    }

    static let reclaims: [Reclaim] = [
        Reclaim(id: "r1", doc: ReclaimDoc(requesterUid: "u9", name: "Cody", seatId: "s2", status: .pending, createdAt: fixedNow)),
        Reclaim(id: "r2", doc: ReclaimDoc(requesterUid: "u8", name: "Mary Jane", seatId: "s4", status: .pending, createdAt: fixedNow)),
    ]
}
