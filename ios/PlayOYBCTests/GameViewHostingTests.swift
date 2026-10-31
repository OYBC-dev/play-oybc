import SwiftUI
import XCTest
@testable import PlayOYBC

/// Hosts the real GameView in a window and drives it through every stage.
@MainActor
final class GameViewHostingTests: XCTestCase {
    private func spin(_ seconds: Double = 0.2) async {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            try? await _Concurrency.Task.sleep(nanoseconds: 10_000_000)
        }
    }

    /// Spins until `condition` holds or `timeout` passes (CI runners render the first frame slowly).
    private func waitUntil(_ timeout: Double = 5, _ condition: () -> Bool) async {
        let end = Date().addingTimeInterval(timeout)
        while !condition() && Date() < end {
            try? await _Concurrency.Task.sleep(nanoseconds: 20_000_000)
        }
    }

    private func snapshot(_ stage: Stage) -> GameSnapshot {
        var cells: [BoardCell] = (0..<25).map { .task(taskId: "t\($0)", text: "T\($0)") }
        cells[12] = .free
        var marks = [Bool](repeating: false, count: 25)
        marks[12] = true
        return GameSnapshot(
            game: GameDoc(code: "ABCDE", stage: stage, hostSeatId: "s1", createdAt: 1, launchedAt: nil, endedAt: nil, bingoCount: 0, shortfalls: [:], reviewGate: false),
            mySeatId: "s1", seats: [Seat(seatId: "s1", doc: SeatDoc(name: "Stephen", nameKey: "stephen", joinedAt: 1))], view: [],
            board: stage == .lobby ? nil : BoardDoc(cells: cells, marks: marks, completedLines: [], announcedLines: []),
            bingos: [], reclaims: [])
    }

    func testStageSwitchesKeepOneLiveSubscription() async {
        let fake = FakeGameService()
        let vm = GameViewModel(service: fake, gameId: "g1", seatId: "s1")
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        window.rootViewController = UIHostingController(rootView: GameView(vm: vm, service: fake, onHome: {}))
        window.makeKeyAndVisible()
        await waitUntil { fake.subscribeCount == 1 }
        XCTAssertEqual(fake.subscribeCount, 1)

        for stage in [Stage.lobby, .playing, .ended] {
            fake.emit(snapshot(stage))
            await waitUntil { vm.snapshot?.game.stage == stage }
            await spin()
            XCTAssertEqual(vm.snapshot?.game.stage, stage, "snapshot for \(stage) delivered")
            XCTAssertEqual(fake.subscribeCount, 1, "subscribed once (\(stage))")
            XCTAssertEqual(fake.activeSubscriptions, 1, "stream still live after \(stage)")
        }

        // Tearing the screen down cancels the subscription.
        window.rootViewController = nil
        window.isHidden = true
        await waitUntil { fake.activeSubscriptions == 0 }
        XCTAssertEqual(fake.activeSubscriptions, 0)
    }
}
