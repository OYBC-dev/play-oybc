import XCTest
@testable import PlayOYBC

final class MentionsTests: XCTestCase {
    func testFindsPartialBeforeCaret() {
        XCTAssertEqual(Mentions.active(in: "hi @co", caret: 6), ActiveMention(start: 3, partial: "co"))
        XCTAssertNil(Mentions.active(in: "a@co", caret: 4))
        XCTAssertEqual(Mentions.options(partial: Mentions.active(in: "hi @co there", caret: 12)!.partial, seatNames: ["Cody"]), [])
    }

    func testOptionsByPrefixThenSomeoneAnyone() {
        XCTAssertEqual(Mentions.options(partial: "", seatNames: ["Cody", "Pat"]), ["Cody", "Pat", "someone", "anyone"])
        XCTAssertEqual(Mentions.options(partial: "an", seatNames: ["Cody", "Anna"]), ["Anna", "anyone"])
    }

    func testMultiWordNameAndLeadingSpace() {
        XCTAssertEqual(Mentions.active(in: "hi @Mary J", caret: 10), ActiveMention(start: 3, partial: "Mary J"))
        XCTAssertEqual(Mentions.options(partial: "Mary J", seatNames: ["Mary Jane", "Pat"]), ["Mary Jane"])
        XCTAssertNil(Mentions.active(in: "hi @ x", caret: 6))
        XCTAssertEqual(Mentions.active(in: "@Mary  J", caret: 8)?.partial, "Mary J")
    }

    func testPickReplacesMentionAndCapsLength() {
        let m = Mentions.active(in: "hi @co", caret: 6)!
        let r = Mentions.pick("Cody", mention: m, in: "hi @co", caret: 6)
        XCTAssertEqual(r.text, "hi @Cody ")
        XCTAssertEqual(r.caret, 9)
        let long = String(repeating: "x", count: 117) + " @a"
        let m2 = Mentions.active(in: long, caret: long.count)!
        XCTAssertEqual(Mentions.pick("anyone", mention: m2, in: long, caret: long.count).text.count, GameConstants.maxTaskLength)
    }
}

final class JoinCodeTests: XCTestCase {
    func testParsesCodesAndLinks() {
        XCTAssertEqual(JoinCode.parse(" hx7kq "), "HX7KQ")
        XCTAssertEqual(JoinCode.parse("https://play-oybc.web.app/g/HX7KQ"), "HX7KQ")
        XCTAssertEqual(JoinCode.parse("https://play-oybc.web.app/g/hx7kq/?utm=x"), "HX7KQ")
        XCTAssertEqual(JoinCode.parse("HTTPS://PLAY-OYBC.WEB.APP/G/HX7KQ"), "HX7KQ")
        XCTAssertNil(JoinCode.parse("   "))
        XCTAssertNil(JoinCode.parse("https://play-oybc.web.app/g/"))
    }

    func testJoinLink() {
        XCTAssertEqual(GameConstants.joinLink(code: "HX7KQ"), "https://play-oybc.web.app/g/HX7KQ")
    }
}

final class LobbyLogicTests: XCTestCase {
    private let seats = [
        Seat(seatId: "a", doc: SeatDoc(name: "Pat", nameKey: "pat", joinedAt: 2)),
        Seat(seatId: "b", doc: SeatDoc(name: "Cody", nameKey: "cody", joinedAt: 1)),
    ]

    private func game(_ shortfalls: [String: Int]) -> GameDoc {
        GameDoc(code: "ABCDE", stage: .lobby, hostSeatId: "a", createdAt: 0, launchedAt: nil, endedAt: nil, bingoCount: 0, shortfalls: shortfalls, reviewGate: false)
    }

    func testShortfallCopySingularPluralSortedAndUnknownSeat() {
        XCTAssertEqual(LobbyLogic.shortfallLines(game: game(["a": 1, "b": 3, "c": 2, "d": 0]), seats: seats),
                       ["Cody needs 3 more tasks", "Pat needs 1 more task", "Someone needs 2 more tasks"])
    }

    func testCanLaunch() {
        XCTAssertFalse(LobbyLogic.canLaunch(game: game(["a": 1]), seats: seats, poolSize: 30))
        XCTAssertFalse(LobbyLogic.canLaunch(game: game([:]), seats: seats, poolSize: 23))
        XCTAssertTrue(LobbyLogic.canLaunch(game: game(["a": 0]), seats: seats, poolSize: 24))
    }

    func testSeatsByJoinAndClock() {
        XCTAssertEqual(LobbyLogic.seatsByJoin(seats).map(\.name), ["Cody", "Pat"])
        let utc = TimeZone(identifier: "UTC")!
        XCTAssertEqual(LobbyLogic.clock(0, timeZone: utc), "12:00")
        XCTAssertEqual(LobbyLogic.clock(13 * 3_600_000 + 5 * 60_000, timeZone: utc), "1:05")
    }
}

final class BoardLinesTests: XCTestCase {
    func testLines() {
        XCTAssertEqual(BoardLines.cells(of: "row_1"), [5, 6, 7, 8, 9])
        XCTAssertEqual(BoardLines.cells(of: "col_2"), [2, 7, 12, 17, 22])
        XCTAssertEqual(BoardLines.cells(of: "diag_main"), [0, 6, 12, 18, 24])
        XCTAssertEqual(BoardLines.cells(of: "diag_anti"), [4, 8, 12, 16, 20])
        XCTAssertEqual(BoardLines.cells(of: "row_5"), [])
        XCTAssertEqual(BoardLines.cells(of: "bogus"), [])
        XCTAssertEqual(BoardLines.cells(in: ["row_0", "col_0"]).count, 9)
    }

    func testCellStyle() {
        XCTAssertEqual(CellStyle(free: false, marked: true, highlighted: true).fill, .risoGold)
        XCTAssertEqual(CellStyle(free: false, marked: true, highlighted: false).fill, .risoRed)
        XCTAssertEqual(CellStyle(free: false, marked: false, highlighted: false).fill, .risoPaper2)
    }
}

final class ErrorMessagesTests: XCTestCase {
    func testKnownCodesTokenAndFallback() {
        XCTAssertEqual(ErrorMessages.message(for: AppError(code: "not-ready", token: nil, underlying: nil)), "Not everyone has enough tasks yet")
        XCTAssertEqual(ErrorMessages.message(for: AppError(code: "unknown-mention", token: "@Zed", underlying: nil)), "No player named @Zed")
        XCTAssertEqual(ErrorMessages.message(for: AppError(code: "unknown-mention", token: nil, underlying: nil)), "No one here goes by that name")
        XCTAssertEqual(ErrorMessages.message(for: NSError(domain: "x", code: 1)), "Something went wrong")
        XCTAssertEqual(ErrorMessages.message(for: AppError(code: "reclaim-cooldown", token: nil, underlying: nil)), "Wait a minute before asking again")
    }

    func testListenerCopy() {
        let denied = AppError(code: "permission-denied", token: nil, underlying: nil)
        XCTAssertEqual(ErrorMessages.listenerMessage(for: denied, wasSeated: true), "You've been replaced in this game.")
        XCTAssertEqual(ErrorMessages.listenerMessage(for: denied, wasSeated: false), "You're not in this game.")
        XCTAssertEqual(ErrorMessages.listenerMessage(for: AppError.gameNotFound, wasSeated: true), "No game with that code")
    }
}
