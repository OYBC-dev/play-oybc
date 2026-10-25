import SwiftUI
import XCTest
@testable import PlayOYBC

/// Mirrors `web/src/game/avatars.test.ts` case for case.
final class AvatarForTests: XCTestCase {
    func testSingleWordGivesOneLetterUppercased() {
        XCTAssertEqual(AvatarFor.make(name: "maya", index: 0).initial, "M")
    }

    func testSeveralWordsStillGiveOneLetterFromTheFirstWord() {
        XCTAssertEqual(AvatarFor.make(name: "ada lovelace", index: 0).initial, "A")
        XCTAssertEqual(AvatarFor.make(name: "  ada  byron lovelace", index: 0).initial, "A")
    }

    func testBlankGivesQuestionMark() {
        XCTAssertEqual(AvatarFor.make(name: "   ", index: 0).initial, "?")
        XCTAssertEqual(AvatarFor.make(name: "", index: 0).initial, "?")
        XCTAssertEqual(AvatarFor.make(name: "\n\t ", index: 0).initial, "?")
    }

    func testDoesNotSplitEmoji() {
        XCTAssertEqual(AvatarFor.make(name: "🎉 party", index: 0).initial, "🎉")
    }

    func testSeatOverloadUsesTheSeatName() {
        let seat = Seat(seatId: "s1", doc: SeatDoc(name: "cody", nameKey: "cody", joinedAt: 0))
        XCTAssertEqual(AvatarFor.make(seat: seat, index: 1).initial, "C")
    }

    func testCyclesFillsRedBlueGoldGreenPaper2AndWraps() {
        let slots = (0...5).map { AvatarFor.slot(index: $0) }
        XCTAssertEqual(slots, [.red, .blue, .gold, .green, .paper2, .red])
        XCTAssertEqual(AvatarFor.slot(index: -1), .paper2)
        let fills = (0...5).map { AvatarFor.make(name: "x", index: $0).fill }
        XCTAssertEqual(fills, [.risoRed, .risoBlue, .risoGold, .risoGreen, .risoPaper2, .risoRed])
    }

    func testPicksTextColoursPerFill() {
        XCTAssertEqual(AvatarFor.make(name: "x", index: 0).foreground, .risoOnColor)
        XCTAssertEqual(AvatarFor.make(name: "x", index: 1).foreground, .risoOnColor)
        XCTAssertEqual(AvatarFor.make(name: "x", index: 2).foreground, .risoInkStatic)
        XCTAssertEqual(AvatarFor.make(name: "x", index: 3).foreground, .risoOnColor)
        XCTAssertEqual(AvatarFor.make(name: "x", index: 4).foreground, .risoInk)
    }
}
