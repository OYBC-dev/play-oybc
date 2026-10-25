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
}

private enum SnapshotLikeFixture {
    static let ended = GameSnapshot(
        game: GameDoc(code: "ABCDE", stage: .ended, hostSeatId: "s1", createdAt: 1, launchedAt: nil, endedAt: 2, bingoCount: 0, shortfalls: [:], reviewGate: false),
        mySeatId: "s1", seats: [], view: [], board: nil, bingos: [], reclaims: [])
}
