import XCTest
@testable import PlayOYBC

/// Fixtures are hand-written to match game-core/src/schema.ts (no saved emulator output exists).
final class SchemaDecodingTests: XCTestCase {
    private func load<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: name, withExtension: "json"), "missing fixture \(name)")
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    func testGameDoc() throws {
        let g = try load(GameDoc.self, "game")
        XCTAssertEqual(g.stage, .playing)
        XCTAssertEqual(g.launchedAt, 1700000100000)
        XCTAssertNil(g.endedAt)
        XCTAssertEqual(g.shortfalls["s2"], 3)
        XCTAssertFalse(g.reviewGate)
    }

    func testLobbyGameHasNoLaunchedAt() throws {
        let g = try load(GameDoc.self, "game-lobby")
        XCTAssertEqual(g.stage, .lobby)
        XCTAssertNil(g.launchedAt)
    }

    func testSeatAndView() throws {
        XCTAssertEqual(try load(SeatDoc.self, "seat").name, "Ann")
        let v = try load(ViewDoc.self, "view")
        XCTAssertEqual(v.entries[0].text, "Someone sings")
        XCTAssertNil(v.entries[1].text)
        XCTAssertFalse(v.entries[1].mine)
    }

    func testBoardCellsDecodeKind() throws {
        let b = try load(BoardDoc.self, "board")
        XCTAssertEqual(b.cells.count, 25)
        XCTAssertEqual(b.cells[12], .free)
        XCTAssertEqual(b.cells[0], .task(taskId: "t0", text: "Task 0"))
        XCTAssertTrue(b.marks[12])
        XCTAssertEqual(b.marks.filter { $0 }.count, 1)
    }

    func testUnknownCellKindThrows() {
        XCTAssertThrowsError(try JSONDecoder().decode(BoardCell.self, from: Data(#"{"kind":"wild"}"#.utf8)))
    }

    func testBingoAndReclaim() throws {
        let b = try load(BingoDoc.self, "bingo")
        XCTAssertEqual(b.status, .announced)
        XCTAssertEqual(b.name, "Cody")
        XCTAssertEqual(try load(ReclaimDoc.self, "reclaim").status, .pending)
    }

    func testJoinResponses() throws {
        XCTAssertEqual(try load(JoinGameRes.self, "join-joined"), .joined(gameId: "g1", seatId: "s2"))
        XCTAssertEqual(try load(JoinGameRes.self, "join-reclaim"), .reclaimPending(gameId: "g1", reclaimId: "r1"))
    }

    func testToggleResponse() throws {
        let r = try load(ToggleMarkRes.self, "toggle-res")
        XCTAssertEqual(r.completedLines, ["row_2"])
        XCTAssertEqual(r.newBingoSeqs, [4])
    }

    func testToggleRequestEncodesMarkedOnlyWhenSet() throws {
        let set = try XCTUnwrap(try FirebaseCoding.encode(ToggleMarkReq(gameId: "g", cellIndex: 3, marked: false)) as? [String: Any])
        XCTAssertEqual(set["marked"] as? Bool, false)
        let flip = try XCTUnwrap(try FirebaseCoding.encode(ToggleMarkReq(gameId: "g", cellIndex: 3)) as? [String: Any])
        XCTAssertNil(flip["marked"])
    }

    func testRoundTrip() throws {
        let b = try load(BoardDoc.self, "board")
        XCTAssertEqual(try JSONDecoder().decode(BoardDoc.self, from: JSONEncoder().encode(b)), b)
    }

    /// Production path: Firestore hands back [String: Any] with NSNumber / NSNull values.
    func testDecodeFromFoundationDictionary() throws {
        let dict: [String: Any] = [
            "code": "ABCDE", "stage": "lobby", "hostSeatId": "s1",
            "createdAt": NSNumber(value: 1_700_000_000_000.0), "launchedAt": NSNull(),
            "bingoCount": NSNumber(value: 0), "shortfalls": ["s2": NSNumber(value: 2)], "reviewGate": NSNumber(value: false),
        ]
        let g = try FirebaseCoding.decode(GameDoc.self, from: dict)
        XCTAssertEqual(g.createdAt, 1_700_000_000_000)
        XCTAssertNil(g.launchedAt)
        XCTAssertEqual(g.shortfalls["s2"], 2)
        XCTAssertFalse(g.reviewGate)
    }

    func testInvalidPayloadThrowsInsteadOfCrashing() {
        XCTAssertThrowsError(try FirebaseCoding.decode(GameDoc.self, from: ["createdAt": Date()]))
        XCTAssertThrowsError(try FirebaseCoding.decode(GameDoc.self, from: "nope"))
    }
}
