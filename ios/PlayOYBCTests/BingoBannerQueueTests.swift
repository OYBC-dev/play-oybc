import XCTest
@testable import PlayOYBC

final class BingoBannerQueueTests: XCTestCase {
    private func b(_ seq: Int, _ seat: String = "x", _ name: String = "N") -> BingoDoc {
        BingoDoc(seq: seq, seatId: seat, name: name, line: "row_0", playerBingoNumber: 1, at: Double(seq), status: .announced)
    }

    private func started() -> BingoBannerQueue {
        var q = BingoBannerQueue()
        q.observe([], mySeatId: "me", now: 0)
        return q
    }

    func testNothingForBingosPresentAtFirstObservation() {
        var q = BingoBannerQueue()
        q.observe([b(1, "cody", "Cody")], mySeatId: "me", now: 0)
        XCTAssertTrue(q.banners.isEmpty)
        XCTAssertNil(q.current)
        XCTAssertNil(q.nextDeadline)
    }

    func testLaterBingoByOtherShownNotOwn() {
        var q = started()
        q.observe([b(1, "me", "Me")], mySeatId: "me", now: 1)
        XCTAssertTrue(q.banners.isEmpty)
        q.observe([b(1, "me", "Me"), b(2, "cody", "Cody")], mySeatId: "me", now: 2)
        XCTAssertEqual(q.current?.name, "Cody")
    }

    func testThreeArrivalsTogetherAllShowInArrivalOrder() {
        var q = started()
        q.observe([b(3), b(1), b(2)], mySeatId: "me", now: 0)
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
    }

    func testFourthWaitsAndAppearsWhenFirstLeaves() {
        var q = started()
        q.observe([b(1), b(2), b(3), b(4)], mySeatId: "me", now: 0)
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
        XCTAssertEqual(q.waiting.map(\.seq), [4])
        q.advance(to: 3.9)
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
        q.advance(to: 4)
        XCTAssertEqual(q.banners.map(\.seq), [4])   // 1-3 all shown at 0, all leave at 4; 4 fills the freed slot
    }

    func testStaggeredArrivalsLeaveFourSecondsAfterEachAppeared() {
        var q = started()
        q.observe([b(1)], mySeatId: "me", now: 0)
        q.observe([b(1), b(2)], mySeatId: "me", now: 1)
        q.observe([b(1), b(2), b(3)], mySeatId: "me", now: 2)
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
        XCTAssertEqual(q.nextDeadline, 4)
        q.advance(to: 4)
        XCTAssertEqual(q.banners.map(\.seq), [2, 3])
        XCTAssertEqual(q.nextDeadline, 5)
        q.advance(to: 5)
        XCTAssertEqual(q.banners.map(\.seq), [3])
        XCTAssertEqual(q.nextDeadline, 6)
        q.advance(to: 6)
        XCTAssertTrue(q.banners.isEmpty)
    }

    func testWaitingBannerStartsItsOwnFourSecondsWhenSlotFrees() {
        var q = started()
        q.observe([b(1)], mySeatId: "me", now: 0)
        q.observe([b(1), b(2)], mySeatId: "me", now: 1)
        q.observe([b(1), b(2), b(3)], mySeatId: "me", now: 2)
        q.observe([b(1), b(2), b(3), b(4)], mySeatId: "me", now: 3)   // stack full: 4 waits
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
        q.advance(to: 4.5)   // 1 left at 4 and 4 appeared then, not at 4.5
        XCTAssertEqual(q.banners.map(\.seq), [2, 3, 4])
        XCTAssertEqual(q.visible.last?.shownAt, 4)
        q.advance(to: 8)
        XCTAssertTrue(q.banners.isEmpty)
    }

    func testBurstOfFiveWithinASecondLosesNone() {
        var q = started()
        var all: [BingoDoc] = []
        var shown: [Int] = []
        for i in 1...5 {
            all.append(b(i))
            q.observe(all, mySeatId: "me", now: Double(i) * 0.2)
            shown += q.banners.map(\.seq).filter { !shown.contains($0) }
        }
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
        for t in stride(from: 1.0, through: 12.0, by: 0.5) {
            q.advance(to: t)
            shown += q.banners.map(\.seq).filter { !shown.contains($0) }
        }
        XCTAssertEqual(shown, [1, 2, 3, 4, 5])
        XCTAssertTrue(q.banners.isEmpty)
        XCTAssertTrue(q.waiting.isEmpty)
    }

    func testDismissFrontPromotesWaiting() {
        var q = started()
        q.observe([b(1), b(2), b(3), b(4)], mySeatId: "me", now: 0)
        q.dismissFront(now: 1)
        XCTAssertEqual(q.banners.map(\.seq), [2, 3, 4])
        XCTAssertEqual(q.visible.last?.shownAt, 1)
    }

    func testDoesNotReannounceSeen() {
        var q = started()
        q.observe([b(1)], mySeatId: "me", now: 0)
        q.advance(to: 4)
        q.observe([b(1)], mySeatId: "me", now: 5)
        XCTAssertTrue(q.banners.isEmpty)
    }

    func testConfettiPiecesAreDeterministicAndTokenBounded() {
        let a = ConfettiBurst.pieces(seed: 7)
        XCTAssertEqual(a, ConfettiBurst.pieces(seed: 7))
        XCTAssertNotEqual(a, ConfettiBurst.pieces(seed: 8))
        XCTAssertEqual(a.count, 54)
        XCTAssertTrue(a.allSatisfy { (6...12).contains($0.width) && (9...17).contains($0.height) && $0.colorIndex < 4
            && (1.9...3.2).contains($0.duration) && (0...0.52).contains($0.delay) })
    }
}
