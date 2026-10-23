import XCTest
@testable import PlayOYBC

@MainActor
final class GameViewModelTests: XCTestCase {
    private func snapshot(bingos: [BingoDoc] = []) -> GameSnapshot {
        var cells: [BoardCell] = (0..<25).map { .task(taskId: "t\($0)", text: "T\($0)") }
        cells[12] = .free
        var marks = [Bool](repeating: false, count: 25)
        marks[12] = true
        return GameSnapshot(
            game: GameDoc(code: "ABCDE", stage: .playing, hostSeatId: "s1", createdAt: 1, launchedAt: 2, endedAt: nil, bingoCount: 0, shortfalls: [:], reviewGate: false),
            mySeatId: "s1", seats: [], view: [],
            board: BoardDoc(cells: cells, marks: marks, completedLines: [], announcedLines: []),
            bingos: bingos, reclaims: [])
    }

    private func started(_ fake: FakeGameService, bannerSeconds: Double = 4) async -> GameViewModel {
        let vm = GameViewModel(service: fake, gameId: "g1", seatId: "s1", bannerSeconds: bannerSeconds)
        vm.start()
        await settle()
        fake.emit(snapshot())
        await settle()
        return vm
    }

    private func settle() async { for _ in 0..<5 { await _Concurrency.Task.yield() }; try? await _Concurrency.Task.sleep(nanoseconds: 20_000_000) }

    func testSnapshotPublished() async {
        let vm = await started(FakeGameService())
        XCTAssertEqual(vm.snapshot?.game.code, "ABCDE")
    }

    func testOptimisticToggleThenServerConfirm() async {
        let fake = FakeGameService()
        fake.gateToggle = true
        var marks = [Bool](repeating: false, count: 25); marks[12] = true; marks[3] = true
        fake.toggleResult = .success(ToggleMarkRes(marks: marks, completedLines: [], newBingoSeqs: []))
        let vm = await started(fake)
        let t = _Concurrency.Task { await vm.toggle(cell: 3) }
        await settle()
        XCTAssertEqual(vm.pendingCells, [3])
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true)
        fake.releaseToggle()
        await t.value
        XCTAssertTrue(vm.pendingCells.isEmpty)
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true)
    }

    func testRollbackOnThrow() async {
        let fake = FakeGameService()
        fake.gateToggle = true
        fake.toggleResult = .failure(FakeGameService.FakeError.failed)
        let vm = await started(fake)
        let t = _Concurrency.Task { await vm.toggle(cell: 3) }
        await settle()
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true)
        fake.releaseToggle()
        await t.value
        XCTAssertEqual(vm.snapshot?.board?.marks[3], false)
        XCTAssertTrue(vm.pendingCells.isEmpty)
        XCTAssertNotNil(vm.error)
    }

    func testFreeCellAndPendingCellIgnored() async {
        let fake = FakeGameService()
        let vm = await started(fake)
        await vm.toggle(cell: 12)
        XCTAssertTrue(fake.toggledCells.isEmpty)
    }

    func testBannerShowsForOthersOnlyAndAutoDismisses() async {
        let fake = FakeGameService()
        let vm = await started(fake, bannerSeconds: 0.05)
        XCTAssertNil(vm.banner)
        let cody = BingoDoc(seq: 1, seatId: "s2", name: "Cody", line: "row_0", playerBingoNumber: 1, at: 1, status: .announced)
        fake.emit(snapshot(bingos: [cody]))
        await settle()
        XCTAssertEqual(vm.banner?.name, "Cody")
        try? await _Concurrency.Task.sleep(nanoseconds: 150_000_000)
        XCTAssertNil(vm.banner)
    }

    func testResumeStoreRoundTrip() {
        let d = UserDefaults(suiteName: "resume-test")!
        d.removePersistentDomain(forName: "resume-test")
        let s = ResumeStore(defaults: d)
        XCTAssertNil(s.load())
        s.save(code: "ABCDE")
        XCTAssertEqual(s.load(), "ABCDE")
        s.clear()
        XCTAssertNil(s.load())
    }
}
