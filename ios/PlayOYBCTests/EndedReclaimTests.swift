import SwiftUI
import XCTest
@testable import PlayOYBC

/// I6: the read-only final board, New game, and the host's reclaim toast.
@MainActor
final class EndedReclaimTests: XCTestCase {
    func testReadOnlyBoardIgnoresTaps() {
        XCTAssertFalse(BoardGridView.acceptsTap(readOnly: true, free: false, pending: false))
        XCTAssertTrue(BoardGridView.acceptsTap(readOnly: false, free: false, pending: false))
        XCTAssertFalse(BoardGridView.acceptsTap(readOnly: false, free: true, pending: false))
        XCTAssertFalse(BoardGridView.acceptsTap(readOnly: false, free: false, pending: true))
    }

    func testNewGameClearsSavedPointer() async {
        let d = UserDefaults(suiteName: "i6-newgame")!
        d.removePersistentDomain(forName: "i6-newgame")
        let store = ResumeStore(defaults: d)
        let model = AppModel(service: FakeGameService(), store: store)
        model.seat(code: "ABCDE", gameId: "g1", seatId: "s1")
        XCTAssertEqual(store.load(), "ABCDE")
        var wentHome = false
        // EndedView's New game button is wired to the same goHome the Home path uses.
        let ended = EndedView(snapshot: SnapshotLikeFixture.ended, onHome: { wentHome = true; model.goHome() })
        ended.onHome()
        XCTAssertTrue(wentHome)
        XCTAssertEqual(model.route, .home)
        XCTAssertNil(store.load())
    }

    func testAllowAndDenyCallResolveWithTheRightFlag() async {
        let fake = FakeGameService()
        let m = ReclaimPromptModel(service: fake, gameId: "g1")
        await m.resolve("r1", approve: true)
        await m.resolve("r2", approve: false)
        XCTAssertEqual(fake.calls, ["resolveReclaim:r1:true", "resolveReclaim:r2:false"])
        XCTAssertNil(m.busy)
        XCTAssertNil(m.error)
    }

    func testResolveFailureShowsErrorAndReenables() async {
        let fake = FakeGameService()
        fake.callError = FakeGameService.FakeError.failed
        let m = ReclaimPromptModel(service: fake, gameId: "g1")
        await m.resolve("r1", approve: true)
        XCTAssertNotNil(m.error)
        XCTAssertNil(m.busy)
    }

    func testReclaimHeadlineNamesTheSeat() {
        let seats = [Seat(seatId: "s2", doc: SeatDoc(name: "C-Dog", nameKey: "c-dog", joinedAt: 2)),
                     Seat(seatId: "s3", doc: SeatDoc(name: "Cody", nameKey: "cody", joinedAt: 3))]
        func doc(_ name: String, _ seatId: String) -> ReclaimDoc {
            ReclaimDoc(requesterUid: "u9", name: name, seatId: seatId, status: .pending, createdAt: 1, resolvedAt: nil)
        }
        XCTAssertEqual(ReclaimPromptView.headline(for: doc("Cody", "s2"), seats: seats),
                       "Someone as Cody wants to take C-Dog's seat")
        XCTAssertEqual(ReclaimPromptView.headline(for: doc("cody", "s3"), seats: seats),
                       "Someone wants to take Cody's seat")
        // The seat is gone: fall back to the typed name.
        XCTAssertEqual(ReclaimPromptView.headline(for: doc("Cody", "s7"), seats: seats),
                       "Someone wants to take Cody's seat")
    }
}

private enum SnapshotLikeFixture {
    static let ended = GameSnapshot(
        game: GameDoc(code: "ABCDE", stage: .ended, hostSeatId: "s1", createdAt: 1, launchedAt: nil, endedAt: 2, bingoCount: 0, shortfalls: [:], reviewGate: false),
        mySeatId: "s1", seats: [], view: [], board: nil, bingos: [], reclaims: [])
}
