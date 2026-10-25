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

    /// game-core's scanner lets the longest match win, so a seat named "Someone Else" is
    /// mentionable; the picker must keep offering it ahead of the keyword, and keep the keywords.
    func testSeatNameLongerThanKeywordIsOfferedFirst() {
        XCTAssertEqual(Mentions.active(in: "@Someone E", caret: 10)?.partial, "Someone E")
        XCTAssertEqual(Mentions.options(partial: "Someone E", seatNames: ["Someone Else"]), ["Someone Else"])
        XCTAssertEqual(Mentions.options(partial: "someone", seatNames: ["Someone Else", "Pat"]), ["Someone Else", "someone"])
        XCTAssertEqual(Mentions.options(partial: "any", seatNames: ["Someone Else"]), ["anyone"])
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
        XCTAssertTrue(CellStyle(free: false, marked: true, highlighted: true).halftone)
        XCTAssertEqual(CellStyle(free: false, marked: true, highlighted: false).fill, .risoRed)
        XCTAssertEqual(CellStyle(free: false, marked: true, highlighted: false).foreground, .risoOnColor)
        XCTAssertEqual(CellStyle(free: false, marked: false, highlighted: false).fill, .risoPaper2)
        // Free stays ink even inside a completed line, with no overprint.
        XCTAssertEqual(CellStyle(free: true, marked: true, highlighted: true).fill, .risoInk)
        XCTAssertFalse(CellStyle(free: true, marked: true, highlighted: true).halftone)
    }

    func testPendingCellDimsAndDropsShadow() {
        var style = CellStyle(free: false, marked: true, highlighted: false)
        XCTAssertEqual(style.opacity, 1)
        XCTAssertTrue(style.showsShadow)
        style.pending = true
        XCTAssertEqual(style.opacity, 0.55)
        XCTAssertFalse(style.showsShadow)
        style.pending = false
        XCTAssertEqual(style.opacity, 1)
        XCTAssertTrue(style.showsShadow)
    }

    func testCellLineClamp() {
        XCTAssertEqual(CellStyle.lineLimit(cellSide: 65), 4)
        XCTAssertEqual(CellStyle.lineLimit(cellSide: 71.5), 5)
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

final class HostMenuModelTests: XCTestCase {
    private func seat(_ id: String, _ name: String, _ at: Double) -> Seat {
        Seat(seatId: id, doc: SeatDoc(name: name, nameKey: name.lowercased(), joinedAt: at))
    }

    private func snapshot(me: String, seats: [Seat], stage: Stage = .playing) -> GameSnapshot {
        GameSnapshot(game: GameDoc(code: "ABCDE", stage: stage, hostSeatId: "s1", createdAt: 1, launchedAt: nil, endedAt: nil,
                                   bingoCount: 0, shortfalls: [:], reviewGate: false),
                     mySeatId: me, seats: seats, view: [], board: nil, bingos: [], reclaims: [])
    }

    func testMakeHostDisabledWithNoOtherPlayers() {
        let m = HostMenuModel(snapshot: snapshot(me: "s1", seats: [seat("s1", "Stephen", 1)]), canEnd: true)
        XCTAssertTrue(m.showsButton, "the board keeps the button for End game")
        XCTAssertFalse(m.makeHostEnabled)
        XCTAssertTrue(m.showsEndGame)
    }

    func testCandidatesAreOthersInJoinOrder() {
        let seats = [seat("s3", "Pat", 3), seat("s1", "Stephen", 1), seat("s2", "Cody", 2)]
        let m = HostMenuModel(snapshot: snapshot(me: "s1", seats: seats), canEnd: true)
        XCTAssertEqual(m.candidates.map(\.seatId), ["s2", "s3"])
        XCTAssertTrue(m.makeHostEnabled)
    }

    func testLobbyMenuHasNoEndGame() {
        let seats = [seat("s1", "Stephen", 1), seat("s2", "Cody", 2)]
        let m = HostMenuModel(snapshot: snapshot(me: "s1", seats: seats, stage: .lobby), canEnd: false)
        XCTAssertTrue(m.showsButton)
        XCTAssertFalse(m.showsEndGame)
        XCTAssertTrue(m.makeHostEnabled)
    }

    func testLobbyHidesButtonWhenHostAlone() {
        let m = HostMenuModel(snapshot: snapshot(me: "s1", seats: [seat("s1", "Stephen", 1)], stage: .lobby), canEnd: false)
        XCTAssertFalse(m.showsButton)
    }

    func testNonHostNeverSeesButton() {
        let seats = [seat("s1", "Stephen", 1), seat("s2", "Cody", 2)]
        XCTAssertFalse(HostMenuModel(snapshot: snapshot(me: "s2", seats: seats), canEnd: true).showsButton)
    }
}

/// Small red text uses `risoDanger`: the fill red in light, a lift that reads on dark paper.
final class RisoRedTextTests: XCTestCase {
    private func hex(_ name: String, _ style: UIUserInterfaceStyle) -> String {
        let traits = UITraitCollection(userInterfaceStyle: style)
        let c = UIColor(named: name, in: .riso, compatibleWith: traits)!.resolvedColor(with: traits)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "%02X%02X%02X", Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
    }

    private func luminance(_ hex: String) -> Double {
        let v = Int(hex, radix: 16)!
        let lin = [(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF].map { (c: Int) -> Double in
            let s = Double(c) / 255
            return s <= 0.04045 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    }

    private func contrast(_ a: String, _ b: String) -> Double {
        let (x, y) = (luminance(a), luminance(b))
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    func testDangerMatchesWebRedTextAndReadsOnDarkPaper() {
        XCTAssertEqual(hex("RisoDanger", .light), hex("RisoRed", .light))
        XCTAssertEqual(hex("RisoDanger", .dark), "C27D5F")   // web --riso-red-text (dark)
        for paper in ["RisoPaper", "RisoPaper2"] {
            XCTAssertGreaterThanOrEqual(contrast(hex("RisoDanger", .dark), hex(paper, .dark)), 4.5, paper)
            XCTAssertGreaterThanOrEqual(contrast(hex("RisoDanger", .light), hex(paper, .light)), 4.5, paper)
        }
    }
}
