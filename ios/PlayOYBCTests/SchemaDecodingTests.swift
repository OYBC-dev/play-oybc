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
        // Old fixture: no party fields → defaults.
        XCTAssertFalse(g.freeSpace)
        XCTAssertEqual(g.tasksPerBoard, 25)
        XCTAssertEqual(g.dealable, [:])
    }

    func testGameDocPartyFields() throws {
        let json = #"{"code":"ABCDE","stage":"lobby","hostSeatId":"s1","createdAt":1,"bingoCount":0,"shortfalls":{"s2":1},"reviewGate":false,"freeSpace":true,"tasksPerBoard":24,"dealable":{"s1":18,"s2":23}}"#
        let g = try JSONDecoder().decode(GameDoc.self, from: Data(json.utf8))
        XCTAssertTrue(g.freeSpace)
        XCTAssertEqual(g.tasksPerBoard, 24)
        XCTAssertEqual(g.dealable, ["s1": 18, "s2": 23])
    }

    func testPoolEntryRefs() throws {
        let with = try JSONDecoder().decode(PoolViewEntry.self, from: Data(#"{"taskId":"t1","authorName":"Ann","text":"Cody does X","mine":false,"refs":[[0,4]]}"#.utf8))
        XCTAssertEqual(with.refs, [[0, 4]])
        let without = try JSONDecoder().decode(PoolViewEntry.self, from: Data(#"{"taskId":"t1","authorName":"Ann","text":"Sing","mine":false}"#.utf8))
        XCTAssertEqual(without.refs, [])
        let malformed = try JSONDecoder().decode(PoolViewEntry.self, from: Data(#"{"taskId":"t1","authorName":"Ann","text":"Hi","mine":false,"refs":[[1],[3,2],[0,2,5],[0,2]]}"#.utf8))
        XCTAssertEqual(malformed.refs, [[0, 2]])
    }

    func testBoardCellRefs() throws {
        let with = try JSONDecoder().decode(BoardCell.self, from: Data(#"{"kind":"task","taskId":"t1","text":"Cody does X","refs":[[0,4]]}"#.utf8))
        XCTAssertEqual(with, .task(taskId: "t1", text: "Cody does X", refs: [[0, 4]]))
        XCTAssertEqual(with.refs, [[0, 4]])
        let without = try JSONDecoder().decode(BoardCell.self, from: Data(#"{"kind":"task","taskId":"t1","text":"Sing"}"#.utf8))
        XCTAssertEqual(without, .task(taskId: "t1", text: "Sing"))
        XCTAssertEqual(without.refs, [])
        XCTAssertEqual(BoardCell.free.refs, [])
        XCTAssertNil(BoardCell.free.text)
        XCTAssertEqual(try JSONDecoder().decode(BoardCell.self, from: JSONEncoder().encode(with)), with)
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
