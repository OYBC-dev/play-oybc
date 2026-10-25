import XCTest
@testable import PlayOYBC

@MainActor
final class JoinViewModelTests: XCTestCase {
    private func settle() async { for _ in 0..<20 { await _Concurrency.Task.yield() } }

    func testCheckSeatsKnownUidOrAsksForName() async {
        let fake = FakeGameService()
        fake.whoAmIResult = WhoAmIRes(gameId: "g1", seatId: "s1")
        let vm = JoinViewModel(service: fake, code: "ABCDE")
        await vm.check()
        XCTAssertEqual(vm.phase, .seated(gameId: "g1", seatId: "s1"))
        fake.whoAmIResult = nil
        await vm.check()
        XCTAssertEqual(vm.phase, .name)
        fake.whoAmIError = AppError.gameNotFound
        await vm.check()
        XCTAssertEqual(vm.phase, .failed(message: "No game with that code"))
    }

    func testSubmitJoinsOrShowsError() async {
        let fake = FakeGameService()
        let vm = JoinViewModel(service: fake, code: "ABCDE", phase: .name)
        fake.joinResult = .failure(AppError(code: "invalid-name", token: nil, underlying: nil))
        await vm.submit(name: "!!")
        XCTAssertEqual(vm.error, "Use 1–20 letters, numbers or spaces")
        XCTAssertEqual(vm.phase, .name)
        fake.joinResult = .success(.joined(gameId: "g1", seatId: "s2"))
        await vm.submit(name: "Cody")
        XCTAssertNil(vm.error)
        XCTAssertEqual(vm.phase, .seated(gameId: "g1", seatId: "s2"))
        XCTAssertEqual(fake.joins.last?.name, "Cody")
    }

    func testReclaimApprovedSeatsViaWhoAmI() async {
        let fake = FakeGameService()
        fake.joinResult = .success(.reclaimPending(gameId: "g1", reclaimId: "r1"))
        let vm = JoinViewModel(service: fake, code: "ABCDE", phase: .name)
        await vm.submit(name: "Cody")
        XCTAssertEqual(vm.phase, .waiting(gameId: "g1", reclaimId: "r1"))
        await settle()
        fake.emitReclaim(.pending)
        await settle()
        XCTAssertEqual(vm.phase, .waiting(gameId: "g1", reclaimId: "r1"))
        fake.whoAmIResult = WhoAmIRes(gameId: "g1", seatId: "s2")
        fake.emitReclaim(.approved)
        await settle()
        XCTAssertEqual(vm.phase, .seated(gameId: "g1", seatId: "s2"))
    }

    func testReclaimDeniedReturnsToName() async {
        let fake = FakeGameService()
        fake.joinResult = .success(.reclaimPending(gameId: "g1", reclaimId: "r1"))
        let vm = JoinViewModel(service: fake, code: "ABCDE", phase: .name)
        await vm.submit(name: "Cody")
        await settle()
        fake.emitReclaim(.denied)
        await settle()
        XCTAssertEqual(vm.phase, .name)
        XCTAssertTrue(vm.denied)
        XCTAssertNil(vm.error)
        // A new attempt clears the denied line.
        fake.joinResult = .success(.joined(gameId: "g1", seatId: "s9"))
        await vm.submit(name: "Cody")
        XCTAssertFalse(vm.denied)
    }

    func testReclaimWatchErrorReturnsToName() async {
        let fake = FakeGameService()
        fake.joinResult = .success(.reclaimPending(gameId: "g1", reclaimId: "r1"))
        let vm = JoinViewModel(service: fake, code: "ABCDE", phase: .name)
        await vm.submit(name: "Cody")
        await settle()
        fake.failReclaim(AppError(code: "reclaim-not-found", token: nil, underlying: nil))
        await settle()
        XCTAssertEqual(vm.phase, .name)
        XCTAssertEqual(vm.error, "That request is gone")
    }
}
