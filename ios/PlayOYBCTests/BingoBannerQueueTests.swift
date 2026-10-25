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
        XCTAssertNil(q.nextDeadline)
        q.observe([b(1, "me", "Me"), b(2, "cody", "Cody")], mySeatId: "me", now: 2)
        XCTAssertEqual(q.current?.name, "Cody")
        XCTAssertEqual(q.nextDeadline, 6)
    }

    func testTrioAtZeroFrontsChangeAtFourAndEightLastLeavesAtTwelve() {
        var q = started()
        q.observe([b(3), b(1), b(2)], mySeatId: "me", now: 0)
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
        XCTAssertEqual(q.nextDeadline, 4)
        q.advance(to: 3.9)
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
        q.advance(to: 4)
        XCTAssertEqual(q.banners.map(\.seq), [2, 3])
        XCTAssertEqual(q.frontSince, 4)
        q.advance(to: 7.9)
        XCTAssertEqual(q.current?.seq, 2)
        q.advance(to: 8)
        XCTAssertEqual(q.banners.map(\.seq), [3])
        q.advance(to: 11.9)
        XCTAssertEqual(q.current?.seq, 3)
        q.advance(to: 12)
        XCTAssertTrue(q.banners.isEmpty)
        XCTAssertNil(q.nextDeadline)
    }

    func testLateAdvanceStartsEachFrontWhenThePreviousLeft() {
        var q = started()
        q.observe([b(1), b(2), b(3)], mySeatId: "me", now: 0)
        q.advance(to: 9)   // 1 left at 4, 2 left at 8; 3 has been front since 8
        XCTAssertEqual(q.banners.map(\.seq), [3])
        XCTAssertEqual(q.frontSince, 8)
        XCTAssertEqual(q.nextDeadline, 12)
    }

    func testFourthWaitsBehindTheStackOfThree() {
        var q = started()
        q.observe([b(1), b(2), b(3), b(4)], mySeatId: "me", now: 0)
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
        XCTAssertEqual(q.waiting.map(\.seq), [4])
        q.advance(to: 4)
        XCTAssertEqual(q.banners.map(\.seq), [2, 3, 4])
        XCTAssertTrue(q.waiting.isEmpty)
    }

    func testArrivalBehindARunningFrontDoesNotResetItsClock() {
        var q = started()
        q.observe([b(1)], mySeatId: "me", now: 0)
        q.observe([b(1), b(2)], mySeatId: "me", now: 3)
        XCTAssertEqual(q.nextDeadline, 4)
        q.advance(to: 4)
        XCTAssertEqual(q.banners.map(\.seq), [2])
        XCTAssertEqual(q.nextDeadline, 8)
    }

    func testBurstOfFiveWithinASecondLosesNone() {
        var q = started()
        var all: [BingoDoc] = []
        var fronts: [Int] = []
        for i in 1...5 {
            all.append(b(i))
            q.observe(all, mySeatId: "me", now: Double(i) * 0.2)
            if let f = q.current?.seq, fronts.last != f { fronts.append(f) }
        }
        XCTAssertEqual(q.banners.map(\.seq), [1, 2, 3])
        XCTAssertEqual(q.waiting.map(\.seq), [4, 5])
        for t in stride(from: 1.0, through: 24.0, by: 0.5) {
            q.advance(to: t)
            if let f = q.current?.seq, fronts.last != f { fronts.append(f) }
        }
        XCTAssertEqual(fronts, [1, 2, 3, 4, 5])
        XCTAssertTrue(q.banners.isEmpty)
        XCTAssertTrue(q.waiting.isEmpty)
    }

    func testDismissFrontPromotesNextAndStartsItsClock() {
        var q = started()
        q.observe([b(1), b(2), b(3), b(4)], mySeatId: "me", now: 0)
        q.dismissFront(now: 1)
        XCTAssertEqual(q.banners.map(\.seq), [2, 3, 4])
        XCTAssertEqual(q.nextDeadline, 5)
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
