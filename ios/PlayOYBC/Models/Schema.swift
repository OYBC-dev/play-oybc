import Foundation

/// Mirrors `packages/game-core/src/schema.ts` 1:1. Timestamps are epoch milliseconds.
enum Stage: String, Codable, Equatable { case lobby, playing, ended }

struct GameDoc: Codable, Equatable {
    var code: String
    var stage: Stage
    var hostSeatId: String
    var createdAt: Double
    var launchedAt: Double?
    var endedAt: Double?
    var bingoCount: Int
    var shortfalls: [String: Int]
    var reviewGate: Bool
    /// Whether boards get a FREE centre (host option, lobby only). Absent on old frames: false.
    var freeSpace: Bool = false
    /// Tasks each board needs: 24 with free space, else 25. Absent on old frames: 25.
    var tasksPerBoard: Int = 25
    /// seatId → tasks guaranteed dealable to that seat. Absent on old frames: empty.
    var dealable: [String: Int] = [:]

    private enum Keys: String, CodingKey {
        case code, stage, hostSeatId, createdAt, launchedAt, endedAt, bingoCount, shortfalls, reviewGate
        case freeSpace, tasksPerBoard, dealable
    }

    init(code: String, stage: Stage, hostSeatId: String, createdAt: Double, launchedAt: Double?, endedAt: Double?,
         bingoCount: Int, shortfalls: [String: Int], reviewGate: Bool,
         freeSpace: Bool = false, tasksPerBoard: Int = 25, dealable: [String: Int] = [:]) {
        self.code = code
        self.stage = stage
        self.hostSeatId = hostSeatId
        self.createdAt = createdAt
        self.launchedAt = launchedAt
        self.endedAt = endedAt
        self.bingoCount = bingoCount
        self.shortfalls = shortfalls
        self.reviewGate = reviewGate
        self.freeSpace = freeSpace
        self.tasksPerBoard = tasksPerBoard
        self.dealable = dealable
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        code = try c.decode(String.self, forKey: .code)
        stage = try c.decode(Stage.self, forKey: .stage)
        hostSeatId = try c.decode(String.self, forKey: .hostSeatId)
        createdAt = try c.decode(Double.self, forKey: .createdAt)
        launchedAt = try c.decodeIfPresent(Double.self, forKey: .launchedAt)
        endedAt = try c.decodeIfPresent(Double.self, forKey: .endedAt)
        bingoCount = try c.decode(Int.self, forKey: .bingoCount)
        shortfalls = try c.decode([String: Int].self, forKey: .shortfalls)
        reviewGate = try c.decode(Bool.self, forKey: .reviewGate)
        freeSpace = try c.decodeIfPresent(Bool.self, forKey: .freeSpace) ?? false
        tasksPerBoard = try c.decodeIfPresent(Int.self, forKey: .tasksPerBoard) ?? 25
        dealable = try c.decodeIfPresent([String: Int].self, forKey: .dealable) ?? [:]
    }
}

/// One leaderboard row as the server ranks it (game-core `Standing`).
struct Standing: Codable, Equatable {
    var seatId: String
    var name: String
    var bingos: Int
    var marked: Int
    /// Most marked squares in any line not yet complete.
    var bestLine: Int
    var firstBingoSeq: Int?
}

/// Mention references: UTF-16 `[start, end)` pairs into a display text. Decodes `[[Int]]` and
/// keeps only well-formed pairs; absent or malformed (not `[[Int]]`) → empty, never a throw.
enum MentionRefs {
    static func decode<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> [[Int]] {
        let raw = ((try? c.decodeIfPresent([[Int]].self, forKey: key)) ?? nil) ?? []
        return raw.filter { $0.count == 2 && $0[0] >= 0 && $0[0] < $0[1] }
    }
}

struct SeatDoc: Codable, Equatable {
    var name: String
    var nameKey: String
    var joinedAt: Double
}

/// A seat plus its document id (the web `SeatDoc & { seatId }`).
struct Seat: Equatable, Identifiable {
    var seatId: String
    var doc: SeatDoc
    var id: String { seatId }
    var name: String { doc.name }
}

struct PoolViewEntry: Codable, Equatable {
    var taskId: String
    var authorName: String
    /// Display text (mentions resolved); nil when the task text is hidden from this viewer.
    var text: String?
    var mine: Bool
    /// UTF-16 `[start, end)` ranges of mentioned names in `text`; empty = plain task.
    var refs: [[Int]] = []

    private enum Keys: String, CodingKey { case taskId, authorName, text, mine, refs }

    init(taskId: String, authorName: String, text: String?, mine: Bool, refs: [[Int]] = []) {
        self.taskId = taskId
        self.authorName = authorName
        self.text = text
        self.mine = mine
        self.refs = refs
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        taskId = try c.decode(String.self, forKey: .taskId)
        authorName = try c.decode(String.self, forKey: .authorName)
        text = try c.decodeIfPresent(String.self, forKey: .text)
        mine = try c.decode(Bool.self, forKey: .mine)
        refs = MentionRefs.decode(c, .refs)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(taskId, forKey: .taskId)
        try c.encode(authorName, forKey: .authorName)
        try c.encodeIfPresent(text, forKey: .text)
        try c.encode(mine, forKey: .mine)
        if !refs.isEmpty { try c.encode(refs, forKey: .refs) }
    }
}

struct ViewDoc: Codable, Equatable {
    var entries: [PoolViewEntry]
    var updatedAt: Double
}

/// One square of a dealt board; decodes the `kind` discriminator.
enum BoardCell: Codable, Equatable {
    /// `refs`: UTF-16 `[start, end)` ranges of mentioned names in `text`; empty = plain task.
    case task(taskId: String, text: String, refs: [[Int]] = [])
    case free

    private enum Keys: String, CodingKey { case kind, taskId, text, refs }

    /// The task's display text, nil for the free square.
    var text: String? { if case let .task(_, t, _) = self { return t }; return nil }
    /// Mention ranges; empty for plain tasks and the free square.
    var refs: [[Int]] { if case let .task(_, _, r) = self { return r }; return [] }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "free": self = .free
        case "task":
            self = .task(taskId: try c.decode(String.self, forKey: .taskId), text: try c.decode(String.self, forKey: .text),
                         refs: MentionRefs.decode(c, .refs))
        case let other:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "unknown cell kind \(other)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case .free: try c.encode("free", forKey: .kind)
        case let .task(id, text, refs):
            try c.encode("task", forKey: .kind)
            try c.encode(id, forKey: .taskId)
            try c.encode(text, forKey: .text)
            if !refs.isEmpty { try c.encode(refs, forKey: .refs) }
        }
    }
}

struct BoardDoc: Codable, Equatable {
    var cells: [BoardCell]
    var marks: [Bool]
    var completedLines: [String]
    var announcedLines: [String]
}

enum BingoStatus: String, Codable, Equatable { case announced, pending, rejected }

struct BingoDoc: Codable, Equatable {
    var seq: Int
    var seatId: String
    var name: String
    var line: String
    var playerBingoNumber: Int
    var at: Double
    var status: BingoStatus
}

enum ReclaimStatus: String, Codable, Equatable { case pending, approved, denied }

struct ReclaimDoc: Codable, Equatable {
    var requesterUid: String
    var name: String
    var seatId: String
    var status: ReclaimStatus
    var createdAt: Double
    /// When the host approved or denied it; absent while pending.
    var resolvedAt: Double?
}

/// A pending reclaim plus its document id.
struct Reclaim: Equatable, Identifiable {
    var id: String
    var doc: ReclaimDoc
}

struct CreateGameReq: Codable, Equatable { var name: String }
struct CreateGameRes: Codable, Equatable { var gameId: String; var code: String; var seatId: String }
struct JoinGameReq: Codable, Equatable { var code: String; var name: String }

enum JoinGameRes: Codable, Equatable {
    case joined(gameId: String, seatId: String)
    case resumed(gameId: String, seatId: String)
    case reclaimPending(gameId: String, reclaimId: String)

    private enum Keys: String, CodingKey { case status, gameId, seatId, reclaimId }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let gameId = try c.decode(String.self, forKey: .gameId)
        switch try c.decode(String.self, forKey: .status) {
        case "joined": self = .joined(gameId: gameId, seatId: try c.decode(String.self, forKey: .seatId))
        case "resumed": self = .resumed(gameId: gameId, seatId: try c.decode(String.self, forKey: .seatId))
        case "reclaim-pending": self = .reclaimPending(gameId: gameId, reclaimId: try c.decode(String.self, forKey: .reclaimId))
        case let other:
            throw DecodingError.dataCorruptedError(forKey: .status, in: c, debugDescription: "unknown status \(other)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case let .joined(g, s): try c.encode("joined", forKey: .status); try c.encode(g, forKey: .gameId); try c.encode(s, forKey: .seatId)
        case let .resumed(g, s): try c.encode("resumed", forKey: .status); try c.encode(g, forKey: .gameId); try c.encode(s, forKey: .seatId)
        case let .reclaimPending(g, r): try c.encode("reclaim-pending", forKey: .status); try c.encode(g, forKey: .gameId); try c.encode(r, forKey: .reclaimId)
        }
    }
}

struct WhoAmIReq: Codable, Equatable { var code: String }
struct WhoAmIRes: Codable, Equatable { var gameId: String; var seatId: String }
struct AddTaskReq: Codable, Equatable { var gameId: String; var text: String }
struct AddTaskRes: Codable, Equatable { var taskId: String }
struct DeleteTaskReq: Codable, Equatable { var gameId: String; var taskId: String }
struct LaunchGameReq: Codable, Equatable { var gameId: String }
/// `marked` sets the square to that value (idempotent); nil = flip (0.1.0 clients). Nil is omitted on the wire.
struct ToggleMarkReq: Codable, Equatable { var gameId: String; var cellIndex: Int; var marked: Bool? = nil }
struct ToggleMarkRes: Codable, Equatable { var marks: [Bool]; var completedLines: [String]; var newBingoSeqs: [Int] }
struct EndGameReq: Codable, Equatable { var gameId: String }
struct ResolveReclaimReq: Codable, Equatable { var gameId: String; var reclaimId: String; var approve: Bool }
struct TransferHostReq: Codable, Equatable { var gameId: String; var toSeatId: String }
