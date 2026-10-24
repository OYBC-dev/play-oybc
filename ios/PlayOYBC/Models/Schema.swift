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
    /// nil when the task text is hidden from this viewer.
    var text: String?
    var mine: Bool
}

struct ViewDoc: Codable, Equatable {
    var entries: [PoolViewEntry]
    var updatedAt: Double
}

/// One square of a dealt board; decodes the `kind` discriminator.
enum BoardCell: Codable, Equatable {
    case task(taskId: String, text: String)
    case free

    private enum Keys: String, CodingKey { case kind, taskId, text }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "free": self = .free
        case "task": self = .task(taskId: try c.decode(String.self, forKey: .taskId), text: try c.decode(String.self, forKey: .text))
        case let other:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "unknown cell kind \(other)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case .free: try c.encode("free", forKey: .kind)
        case let .task(id, text):
            try c.encode("task", forKey: .kind)
            try c.encode(id, forKey: .taskId)
            try c.encode(text, forKey: .text)
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
