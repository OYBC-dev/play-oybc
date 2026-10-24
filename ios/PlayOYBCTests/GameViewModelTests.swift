import FirebaseFirestore
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

    /// Deterministic stand-in for the banner timer: `fire()` ends every pending wait.
    final class ManualSleeper: @unchecked Sendable {
        private var waiters: [CheckedContinuation<Void, Never>] = []
        lazy var sleep: GameViewModel.Sleeper = { [unowned self] _ in
            await withCheckedContinuation { self.waiters.append($0) }
        }
        func fire() { let w = waiters; waiters = []; w.forEach { $0.resume() } }
    }

    private func started(_ fake: FakeGameService, sleeper: GameViewModel.Sleeper? = nil, stage: Stage = .playing) async -> GameViewModel {
        let vm = GameViewModel(service: fake, gameId: "g1", seatId: "s1", sleeper: sleeper ?? GameViewModel.realSleep)
        vm.start()
        await settle()
        var s = snapshot()
        s.game.stage = stage
        fake.emit(s)
        await settle()
        return vm
    }

    private func settle() async { for _ in 0..<20 { await _Concurrency.Task.yield() } }

    private func serverMarks(_ on: Int...) -> [Bool] {
        var m = [Bool](repeating: false, count: 25); m[12] = true
        on.forEach { m[$0] = true }
        return m
    }

    func testSnapshotPublished() async {
        let vm = await started(FakeGameService())
        XCTAssertEqual(vm.snapshot?.game.code, "ABCDE")
    }

    func testOptimisticMarkHeldUntilSnapshotWhichWins() async {
        let fake = FakeGameService()
        fake.gateToggle = true
        fake.toggleResult = .success(ToggleMarkRes(marks: serverMarks(3), completedLines: ["row_0"], newBingoSeqs: []))
        let vm = await started(fake)
        let t = _Concurrency.Task { await vm.toggle(cell: 3) }
        await settle()
        XCTAssertEqual(vm.pendingCells, [3])
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true)
        fake.releaseToggle(cell: 3)
        await t.value
        // Response does not rewrite the board; the optimistic mark stays, no longer pending.
        XCTAssertTrue(vm.pendingCells.isEmpty)
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true)
        XCTAssertEqual(vm.snapshot?.board?.completedLines, [])
        // The next snapshot reconciles to the server, even when it disagrees.
        var s = snapshot()
        s.board?.marks = serverMarks(5)
        s.board?.completedLines = ["row_0"]
        fake.emit(s)
        await settle()
        XCTAssertEqual(vm.snapshot, s)
    }

    func testRollbackOnThrowAndErrorMapped() async {
        let fake = FakeGameService()
        fake.toggleResult = .failure(FakeGameService.FakeError.failed)
        let vm = await started(fake)
        await vm.toggle(cell: 3)
        XCTAssertEqual(vm.snapshot?.board?.marks[3], false)
        XCTAssertTrue(vm.pendingCells.isEmpty)
        XCTAssertEqual(vm.error?.code, "unknown")
    }

    func testSuccessClearsError() async {
        let fake = FakeGameService()
        fake.toggleResult = .failure(FakeGameService.FakeError.failed)
        let vm = await started(fake)
        await vm.toggle(cell: 3)
        XCTAssertNotNil(vm.error)
        fake.toggleResult = .success(ToggleMarkRes(marks: serverMarks(4), completedLines: [], newBingoSeqs: []))
        await vm.toggle(cell: 4)
        XCTAssertNil(vm.error)
    }

    func testTwoQuickTogglesOutOfOrderResponses() async {
        let fake = FakeGameService()
        fake.gateToggle = true
        fake.toggleResultByCell[3] = .success(ToggleMarkRes(marks: serverMarks(3), completedLines: [], newBingoSeqs: []))
        fake.toggleResultByCell[4] = .failure(FakeGameService.FakeError.failed)
        let vm = await started(fake)
        let a = _Concurrency.Task { await vm.toggle(cell: 3) }
        let b = _Concurrency.Task { await vm.toggle(cell: 4) }
        await settle()
        XCTAssertEqual(vm.pendingCells, [3, 4])
        fake.releaseToggle(cell: 4)   // second response first, and it fails
        await b.value
        XCTAssertEqual(vm.pendingCells, [3])
        XCTAssertEqual(vm.snapshot?.board?.marks[4], false)
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true)
        fake.releaseToggle(cell: 3)
        await a.value
        XCTAssertTrue(vm.pendingCells.isEmpty)
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true)
    }

    func testSnapshotMidFlightKeepsPendingCellOptimistic() async {
        let fake = FakeGameService()
        fake.gateToggle = true
        fake.toggleResult = .success(ToggleMarkRes(marks: serverMarks(3), completedLines: [], newBingoSeqs: []))
        let vm = await started(fake)
        let t = _Concurrency.Task { await vm.toggle(cell: 3) }
        await settle()
        fake.emit(snapshot())            // stale snapshot lands while the call is in flight
        await settle()
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true)
        fake.releaseToggle(cell: 3)
        await t.value
    }

    func testGameOnlySnapshotKeepsSettledOptimisticMark() async {
        let fake = FakeGameService()
        fake.toggleResult = .success(ToggleMarkRes(marks: serverMarks(3), completedLines: [], newBingoSeqs: []))
        let vm = await started(fake)
        await vm.toggle(cell: 3)
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true)
        // Someone else's bingo changes the game doc; the board is unchanged.
        var other = snapshot()
        other.game.bingoCount = 1
        fake.emit(other)
        await settle()
        XCTAssertEqual(vm.snapshot?.game.bingoCount, 1)
        XCTAssertEqual(vm.snapshot?.board?.marks[3], true, "optimistic mark must not flicker off")
        // The board update lands and wins.
        var updated = other
        updated.board?.marks = serverMarks(3)
        fake.emit(updated)
        await settle()
        XCTAssertEqual(vm.snapshot, updated)
        // A later board that disagrees still reconciles.
        var later = updated
        later.board?.marks = serverMarks()
        fake.emit(later)
        await settle()
        XCTAssertEqual(vm.snapshot?.board?.marks[3], false)
    }

    func testListenerPermissionDeniedSetsStreamErrorOnly() async {
        let fake = FakeGameService()
        let vm = await started(fake)
        fake.fail(NSError(domain: FirestoreErrorDomain, code: FirestoreErrorCode.permissionDenied.rawValue))
        await settle()
        XCTAssertEqual(vm.streamError?.code, "permission-denied")
        XCTAssertNil(vm.error)
        XCTAssertNotNil(vm.snapshot, "the last snapshot is kept so the view knows the seat existed")
    }

    func testSlowCallDimsAfterThresholdAndClearsOnSettle() async {
        let fake = FakeGameService()
        fake.gateToggle = true
        fake.toggleResult = .success(ToggleMarkRes(marks: serverMarks(3), completedLines: [], newBingoSeqs: []))
        let sleeper = ManualSleeper()
        let vm = await started(fake, sleeper: sleeper.sleep)
        let t = _Concurrency.Task { await vm.toggle(cell: 3) }
        await settle()
        XCTAssertEqual(vm.pendingCells, [3])
        XCTAssertTrue(vm.slowCells.isEmpty, "not dimmed before 250 ms")
        sleeper.fire()
        await settle()
        XCTAssertEqual(vm.slowCells, [3])
        fake.releaseToggle(cell: 3)
        await t.value
        XCTAssertTrue(vm.slowCells.isEmpty)
    }

    func testFastCallNeverDims() async {
        let fake = FakeGameService()
        fake.toggleResult = .success(ToggleMarkRes(marks: serverMarks(3), completedLines: [], newBingoSeqs: []))
        let sleeper = ManualSleeper()
        let vm = await started(fake, sleeper: sleeper.sleep)
        await vm.toggle(cell: 3)
        sleeper.fire()   // the 250 ms timer fires after the call already settled
        await settle()
        XCTAssertTrue(vm.slowCells.isEmpty)
        XCTAssertTrue(vm.pendingCells.isEmpty)
    }

    func testPendingCellIgnoresSecondToggle() async {
        let fake = FakeGameService()
        fake.gateToggle = true
        fake.toggleResult = .success(ToggleMarkRes(marks: serverMarks(3), completedLines: [], newBingoSeqs: []))
        let vm = await started(fake)
        let t = _Concurrency.Task { await vm.toggle(cell: 3) }
        await settle()
        await vm.toggle(cell: 3)
        XCTAssertEqual(fake.toggledCells, [3])
        fake.releaseToggle(cell: 3)
        await t.value
    }

    func testToggleSendsDesiredValue() async {
        let fake = FakeGameService()
        fake.toggleResult = .success(ToggleMarkRes(marks: serverMarks(3), completedLines: [], newBingoSeqs: []))
        let vm = await started(fake)
        await vm.toggle(cell: 3)
        var s = snapshot()
        s.board?.marks[3] = true
        fake.emit(s)
        await settle()
        await vm.toggle(cell: 3)
        XCTAssertEqual(fake.toggledCells, [3, 3])
        XCTAssertEqual(fake.toggledValues, [true, false])
    }

    func testFreeCellIgnored() async {
        let fake = FakeGameService()
        let vm = await started(fake)
        await vm.toggle(cell: 12)
        XCTAssertTrue(fake.toggledCells.isEmpty)
    }

    func testTogglesIgnoredOutsidePlaying() async {
        for stage in [Stage.lobby, .ended] {
            let fake = FakeGameService()
            let vm = await started(fake, stage: stage)
            await vm.toggle(cell: 3)
            XCTAssertTrue(fake.toggledCells.isEmpty, "\(stage)")
        }
    }

    func testBannerShowsForOthersOnlyAndDismissesOnTimer() async {
        let fake = FakeGameService()
        let sleeper = ManualSleeper()
        let vm = await started(fake, sleeper: sleeper.sleep)
        XCTAssertNil(vm.banner)
        let own = BingoDoc(seq: 1, seatId: "s1", name: "Me", line: "row_0", playerBingoNumber: 1, at: 1, status: .announced)
        let cody = BingoDoc(seq: 2, seatId: "s2", name: "Cody", line: "row_1", playerBingoNumber: 1, at: 2, status: .announced)
        fake.emit(snapshot(bingos: [own]))
        await settle()
        XCTAssertNil(vm.banner)
        fake.emit(snapshot(bingos: [own, cody]))
        await settle()
        XCTAssertEqual(vm.banner?.name, "Cody")
        sleeper.fire()
        await settle()
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

    // MARK: launch resume

    private func store(_ name: String) -> ResumeStore {
        let d = UserDefaults(suiteName: name)!
        d.removePersistentDomain(forName: name)
        return ResumeStore(defaults: d)
    }

    func testLaunchWithoutStoredCodeSkipsWhoAmI() async {
        let fake = FakeGameService()
        let model = AppModel(service: fake, store: store("r1"))
        await model.launch()
        XCTAssertTrue(fake.whoAmICodes.isEmpty)
        XCTAssertNil(model.resumed)
        XCTAssertTrue(model.launched)
    }

    func testLaunchResumesSeatedGame() async {
        let fake = FakeGameService()
        fake.whoAmIResult = WhoAmIRes(gameId: "g9", seatId: "s9")
        let st = store("r2"); st.save(code: "ABCDE")
        let model = AppModel(service: fake, store: st)
        await model.launch()
        XCTAssertEqual(fake.whoAmICodes, ["ABCDE"])
        XCTAssertEqual(model.resumed, ResumedGame(code: "ABCDE", gameId: "g9", seatId: "s9"))
        XCTAssertEqual(model.route, .game(code: "ABCDE", gameId: "g9", seatId: "s9"))
        XCTAssertTrue(model.launched)
    }

    func testRouteSeatAndHome() async {
        let st = store("r9")
        let model = AppModel(service: FakeGameService(), store: st)
        await model.launch()
        XCTAssertEqual(model.route, .home)
        model.openJoin(code: "ABCDE")
        XCTAssertEqual(model.route, .join(code: "ABCDE"))
        model.seat(code: "ABCDE", gameId: "g1", seatId: "s2")
        XCTAssertEqual(model.route, .game(code: "ABCDE", gameId: "g1", seatId: "s2"))
        XCTAssertEqual(st.load(), "ABCDE")
        model.goHome()
        XCTAssertEqual(model.route, .home)
        XCTAssertNil(st.load())
    }

    func testLaunchTransientFailureKeepsPointerAndOffersResume() async {
        let fake = FakeGameService()
        fake.whoAmIError = AppError(code: "functions/14", token: nil, underlying: nil)
        let st = store("r4"); st.save(code: "ABCDE")
        let model = AppModel(service: fake, store: st)
        await model.launch()
        XCTAssertEqual(st.load(), "ABCDE")
        XCTAssertEqual(model.route, .home)
        XCTAssertEqual(model.resumePrompt, ResumePrompt(code: "ABCDE"))

        await model.retryResume()
        XCTAssertEqual(model.resumePrompt, ResumePrompt(code: "ABCDE", error: "Something went wrong"))
        XCTAssertEqual(st.load(), "ABCDE")

        fake.whoAmIError = nil
        fake.whoAmIResult = WhoAmIRes(gameId: "g9", seatId: "s9")
        await model.retryResume()
        XCTAssertNil(model.resumePrompt)
        XCTAssertEqual(model.route, .game(code: "ABCDE", gameId: "g9", seatId: "s9"))
        XCTAssertEqual(fake.whoAmICodes, ["ABCDE", "ABCDE", "ABCDE"])
    }

    func testLaunchGameNotFoundClearsPointer() async {
        let fake = FakeGameService()
        fake.whoAmIError = AppError.gameNotFound
        let st = store("r5"); st.save(code: "ABCDE")
        let model = AppModel(service: fake, store: st)
        await model.launch()
        XCTAssertNil(st.load())
        XCTAssertNil(model.resumePrompt)
    }

    func testRetryThatFindsNoSeatClearsPrompt() async {
        let fake = FakeGameService()
        fake.whoAmIError = AppError(code: "unknown", token: nil, underlying: nil)
        let st = store("r6"); st.save(code: "ABCDE")
        let model = AppModel(service: fake, store: st)
        await model.launch()
        XCTAssertNotNil(model.resumePrompt)
        fake.whoAmIError = nil
        await model.retryResume()
        XCTAssertNil(model.resumePrompt)
        XCTAssertNil(st.load())
        XCTAssertEqual(model.route, .home)
    }

    func testLaunchClearsPointerWhenNoSeat() async {
        let fake = FakeGameService()
        let st = store("r3"); st.save(code: "ABCDE")
        let model = AppModel(service: fake, store: st)
        await model.launch()
        XCTAssertNil(model.resumed)
        XCTAssertNil(st.load())
    }
}
