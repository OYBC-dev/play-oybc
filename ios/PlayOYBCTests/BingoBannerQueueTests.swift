import XCTest
@testable import PlayOYBC

final class BingoBannerQueueTests: XCTestCase {
    private func b(_ seq: Int, _ seat: String, _ name: String) -> BingoDoc {
        BingoDoc(seq: seq, seatId: seat, name: name, line: "row_0", playerBingoNumber: 1, at: Double(seq), status: .announced)
    }

    func testNothingForBingosPresentAtFirstObservation() {
        var q = BingoBannerQueue()
        q.observe([b(1, "cody", "Cody")], mySeatId: "me")
        XCTAssertNil(q.current)
    }

    func testLaterBingoByOtherShownNotOwn() {
        var q = BingoBannerQueue()
        q.observe([], mySeatId: "me")
        q.observe([b(1, "me", "Me")], mySeatId: "me")
        XCTAssertNil(q.current)
        q.observe([b(1, "me", "Me"), b(2, "cody", "Cody")], mySeatId: "me")
        XCTAssertEqual(q.current?.name, "Cody")
    }

    func testQueuesInSeqOrderAndDismissAdvances() {
        var q = BingoBannerQueue()
        q.observe([], mySeatId: "me")
        q.observe([b(3, "d", "Dee"), b(1, "a", "Ann"), b(2, "c", "Cody")], mySeatId: "me")
        XCTAssertEqual(q.current?.name, "Ann")
        q.dismiss()
        XCTAssertEqual(q.current?.name, "Cody")
        q.dismiss()
        XCTAssertEqual(q.current?.name, "Dee")
        q.dismiss()
        XCTAssertNil(q.current)
    }

    func testDoesNotReannounceSeen() {
        var q = BingoBannerQueue()
        q.observe([], mySeatId: "me")
        q.observe([b(1, "a", "Ann")], mySeatId: "me")
        q.dismiss()
        q.observe([b(1, "a", "Ann")], mySeatId: "me")
        XCTAssertNil(q.current)
    }
}
