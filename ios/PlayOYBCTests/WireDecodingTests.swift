import XCTest
@testable import PlayOYBC

/// Server frames as `server/src/protocol.ts` defines them, decoded through `ServerFrame`.
final class WireDecodingTests: XCTestCase {
    private func decode(_ json: String) throws -> ServerFrame {
        try JSONDecoder().decode(ServerFrame.self, from: Data(json.utf8))
    }

    private let gameJSON = #"{"code":"ABCDE","stage":"lobby","hostSeatId":"s1","createdAt":1,"bingoCount":0,"shortfalls":{},"reviewGate":false}"#

    func testFullStateWithNullBoard() throws {
        let frame = try decode(#"""
        {"t":"state","rev":7,"game":\#(gameJSON),
         "seats":[{"seatId":"s1","name":"Ann","nameKey":"ann","joinedAt":1}],
         "view":[{"taskId":"t1","authorName":"Ann","text":"Sing","mine":true}],
         "board":null,"bingos":[],
         "reclaims":[{"id":"r1","requesterUid":"u2","name":"Bo","seatId":"s2","status":"pending","createdAt":3}]}
        """#)
        guard case let .state(s) = frame else { return XCTFail("not a state frame: \(frame)") }
        XCTAssertEqual(s.rev, 7)
        XCTAssertEqual(s.game?.stage, .lobby)
        XCTAssertEqual(s.seats, [Seat(seatId: "s1", doc: SeatDoc(name: "Ann", nameKey: "ann", joinedAt: 1))])
        XCTAssertEqual(s.view?.first?.text, "Sing")
        guard case .some(.none) = s.board else { return XCTFail("board null must decode as present-and-nil") }
        XCTAssertEqual(s.bingos, [])
        XCTAssertEqual(s.reclaims, [Reclaim(id: "r1", doc: ReclaimDoc(requesterUid: "u2", name: "Bo", seatId: "s2", status: .pending, createdAt: 3))])
        XCTAssertNil(s.standings, "absent standings stay absent")
        XCTAssertEqual(s.game?.tasksPerBoard, 25)
    }

    func testPartyFieldsDecode() throws {
        let frame = try decode(#"""
        {"t":"state","rev":9,
         "game":{"code":"ABCDE","stage":"lobby","hostSeatId":"s1","createdAt":1,"bingoCount":0,"shortfalls":{},"reviewGate":false,
                 "freeSpace":false,"tasksPerBoard":25,"dealable":{"s1":6}},
         "view":[{"taskId":"t1","authorName":"Ann","text":"Cody does X","mine":true,"refs":[[0,4]]}],
         "board":{"cells":[{"kind":"task","taskId":"t1","text":"Cody does X","refs":[[0,4]]}],"marks":[false],"completedLines":[],"announcedLines":[]},
         "standings":[{"seatId":"s1","name":"Ann","bingos":0,"marked":2,"bestLine":2,"firstBingoSeq":null},
                      {"seatId":"s2","name":"Bo","bingos":2,"marked":11,"bestLine":4,"firstBingoSeq":3}]}
        """#)
        guard case let .state(s) = frame else { return XCTFail("not a state frame") }
        XCTAssertEqual(s.game?.dealable, ["s1": 6])
        XCTAssertFalse(s.game?.freeSpace ?? true)
        XCTAssertEqual(s.view?.first?.refs, [[0, 4]])
        guard case let .some(.some(board)) = s.board else { return XCTFail("board missing") }
        XCTAssertEqual(board.cells.first?.refs, [[0, 4]])
        XCTAssertEqual(s.standings?.map(\.seatId), ["s1", "s2"])
        XCTAssertNil(s.standings?.first?.firstBingoSeq)
        XCTAssertEqual(s.standings?.last?.firstBingoSeq, 3)
    }

    func testPartialStateCarriesOnlyItsSections() throws {
        let frame = try decode(#"{"t":"state","rev":8,"view":[{"taskId":"t1","authorName":"Ann","mine":false}]}"#)
        guard case let .state(s) = frame else { return XCTFail("not a state frame") }
        XCTAssertEqual(s.rev, 8)
        XCTAssertEqual(s.view, [PoolViewEntry(taskId: "t1", authorName: "Ann", text: nil, mine: false)])
        XCTAssertNil(s.game)
        XCTAssertNil(s.seats)
        XCTAssertNil(s.bingos)
        XCTAssertNil(s.reclaims)
        guard case .none = s.board else { return XCTFail("an absent board must decode as absent") }
    }

    func testAckFailureCarriesDetailsToken() throws {
        let frame = try decode(#"{"t":"ack","id":"a3","ok":false,"code":"unknown-mention","details":{"token":"@zed"}}"#)
        guard case let .ack(a) = frame else { return XCTFail("not an ack") }
        XCTAssertEqual(a.id, "a3")
        XCTAssertFalse(a.ok)
        XCTAssertEqual(a.error, AppError(code: "unknown-mention", token: "@zed", underlying: nil))
    }

    func testWelcomeWithNullSeat() throws {
        let frame = try decode(#"{"t":"welcome","uid":"u1","gameId":"g1","seatId":null,"stage":"playing","rev":4}"#)
        XCTAssertEqual(frame, .welcome(Welcome(uid: "u1", gameId: "g1", seatId: nil, stage: .playing, rev: 4)))
    }

    func testReclaimResolvedAtDecodes() throws {
        let frame = try decode(#"{"t":"state","rev":1,"reclaims":[{"id":"r1","requesterUid":"u2","name":"Bo","seatId":"s2","status":"approved","createdAt":3,"resolvedAt":9}]}"#)
        guard case let .state(s) = frame else { return XCTFail("not a state frame") }
        XCTAssertEqual(s.reclaims?.first?.doc.resolvedAt, 9)
    }

    func testNoticesAndUnknownFrames() throws {
        XCTAssertEqual(try decode(#"{"t":"reclaim","id":"r1","status":"denied"}"#), .reclaim(id: "r1", status: .denied))
        XCTAssertEqual(try decode(#"{"t":"evicted","reason":"replaced"}"#), .evicted)
        XCTAssertEqual(try decode(#"{"t":"error","code":"game-not-found"}"#), .error(code: "game-not-found"))
        XCTAssertEqual(try decode(#"{"t":"later-feature"}"#), .unknown)
    }
}
