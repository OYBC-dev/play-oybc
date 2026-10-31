import XCTest
@testable import PlayOYBC

/// Handoff v2 ("Design Touchup v2"): Game settings before create, the lobby sheet's readiness
/// derivations and waiting copy, the task explainer's gate, and the `gameName` wire field.
@MainActor
final class LobbyTouchupTests: XCTestCase {
    // MARK: Fixtures (game HX7KQ, host Stephen; Cody 3 short, Mary Jane 2, Pat 1)

    private let seats: [Seat] = [
        Seat(seatId: "s1", doc: SeatDoc(name: "Stephen", nameKey: "stephen", joinedAt: 1)),
        Seat(seatId: "s2", doc: SeatDoc(name: "Cody", nameKey: "cody", joinedAt: 2)),
        Seat(seatId: "s3", doc: SeatDoc(name: "Pat", nameKey: "pat", joinedAt: 3)),
        Seat(seatId: "s4", doc: SeatDoc(name: "Mary Jane", nameKey: "mary jane", joinedAt: 4)),
    ]

    private func entries(_ count: Int, viewerName: String = "Stephen") -> [PoolViewEntry] {
        let authors = seats.map(\.name)
        return (0..<count).map { i in
            PoolViewEntry(taskId: "t\(i)", authorName: authors[i % 4], text: "Task \(i)", mine: authors[i % 4] == viewerName)
        }
    }

    private func snapshot(me: String = "s1", shortfalls: [String: Int], view: [PoolViewEntry], freeSpace: Bool = false,
                          stage: Stage = .lobby) -> GameSnapshot {
        GameSnapshot(game: GameDoc(code: "HX7KQ", stage: stage, hostSeatId: "s1", createdAt: 1, launchedAt: nil, endedAt: nil,
                                   bingoCount: 0, shortfalls: shortfalls, reviewGate: false, freeSpace: freeSpace,
                                   tasksPerBoard: freeSpace ? 24 : 25, dealable: ["s1": 18, "s2": 22, "s3": 24, "s4": 23]),
                     mySeatId: me, seats: seats, view: view, board: nil, bingos: [], reclaims: [])
    }

    private let filling: [String: Int] = ["s1": 0, "s2": 3, "s3": 1, "s4": 2]
    private let none: [String: Int] = ["s1": 0, "s2": 0, "s3": 0, "s4": 0]

    // MARK: Game settings

    func testCreateSendsTheOptions() async throws {
        let fake = FakeGameService()
        let model = GameSettingsModel(service: fake, hostName: "Stephen")
        model.gameName = "  Halloween at Stephen's  "
        model.freeSpace = true
        XCTAssertEqual(model.tasksPerBoard, 24)
        let res = await model.create()
        XCTAssertEqual(res, CreateGameRes(gameId: "g1", code: "ABCDE", seatId: "s1"))
        XCTAssertEqual(fake.creates, [CreateGameReq(name: "Stephen", gameName: "Halloween at Stephen's", freeSpace: true)])
        XCTAssertNil(model.error)
    }

    func testCreateDefaultsAndBlankName() async {
        let fake = FakeGameService()
        let model = GameSettingsModel(service: fake, hostName: "Stephen")
        model.gameName = "   "
        XCTAssertEqual(model.tasksPerBoard, 25)
        _ = await model.create()
        XCTAssertEqual(fake.creates, [CreateGameReq(name: "Stephen", gameName: nil, freeSpace: false)])
    }

    func testCreateErrorShowsCopyAndReenables() async {
        let fake = FakeGameService()
        fake.createResult = .failure(AppError(code: "invalid-name", token: nil, underlying: nil))
        let model = GameSettingsModel(service: fake, hostName: "Stephen")
        let res = await model.create()
        XCTAssertNil(res)
        XCTAssertEqual(model.error, "Use 1–20 letters, numbers or spaces")
        XCTAssertFalse(model.busy)
    }

    func testCreateIgnoresASecondTapInFlight() async {
        let fake = FakeGameService()
        fake.gateCreate = true
        let model = GameSettingsModel(service: fake, hostName: "Stephen")
        let first = _Concurrency.Task { await model.create() }
        while !model.busy { await _Concurrency.Task.yield() }
        let second = await model.create()
        XCTAssertNil(second)
        while fake.creates.isEmpty { await _Concurrency.Task.yield() }
        fake.releaseCreate()
        let res = await first.value
        XCTAssertNotNil(res)
        XCTAssertEqual(fake.creates.count, 1)
    }

    func testOpenValidatesTheHomeName() {
        let fake = FakeGameService()
        guard case let .failure(e) = GameSettingsModel.open(rawName: "  ", reusing: nil, service: fake) else { return XCTFail("blank name opened") }
        XCTAssertEqual(e.message, "Use 1–20 letters, numbers or spaces")
        guard case .failure = GameSettingsModel.open(rawName: "anyone", reusing: nil, service: fake) else { return XCTFail("keyword opened") }
        guard case let .success(m) = GameSettingsModel.open(rawName: "  Stephen   S ", reusing: nil, service: fake) else { return XCTFail() }
        XCTAssertEqual(m.hostName, "Stephen S")
        XCTAssertTrue(fake.calls.isEmpty, "opening settings creates nothing")
    }

    /// Back then Host again: the same settings come back, with the (possibly edited) Home name.
    func testBackThenHostAgainKeepsTheSettings() {
        let fake = FakeGameService()
        guard case let .success(m) = GameSettingsModel.open(rawName: "Stephen", reusing: nil, service: fake) else { return XCTFail() }
        m.gameName = "Halloween"
        m.freeSpace = true
        m.error = "Something went wrong"
        guard case let .success(again) = GameSettingsModel.open(rawName: "Steve", reusing: m, service: fake) else { return XCTFail() }
        XCTAssertTrue(again === m)
        XCTAssertEqual(again.hostName, "Steve")
        XCTAssertEqual(again.gameName, "Halloween")
        XCTAssertTrue(again.freeSpace)
        XCTAssertNil(again.error)
    }

    // MARK: Readiness (host)

    func testHostFillingSummary() {
        let r = LobbyReadiness(snapshot: snapshot(shortfalls: filling, view: entries(18)))
        XCTAssertFalse(r.ready)
        XCTAssertEqual(r.have, 18)
        XCTAssertEqual(r.target, 25)
        XCTAssertEqual(r.need, 3, "the biggest shortfall, never target − have")
        XCTAssertEqual(r.label, "18 of 25 in the pool")
        XCTAssertEqual(r.status, "Need 3 more")
        XCTAssertEqual(r.progress, 18.0 / 25, accuracy: 0.0001)
        XCTAssertEqual(r.lines.map(\.text), ["Cody needs 3 more", "Mary Jane needs 2 more", "Pat needs 1 more"])
        XCTAssertTrue(r.lines.allSatisfy(\.danger))
        XCTAssertEqual(r.launchLabel, "Launch · need 3 more")
    }

    func testPlayersShortFirstInJoinOrder() {
        let r = LobbyReadiness(snapshot: snapshot(shortfalls: filling, view: entries(18)))
        XCTAssertEqual(r.players.map(\.name), ["Cody", "Pat", "Mary Jane", "Stephen"])
        XCTAssertEqual(r.players.map(\.need), [3, 1, 2, 0])
        XCTAssertEqual(r.players.map(\.index), [1, 2, 3, 0], "avatar colours stay on join order")
        XCTAssertEqual(r.players.last?.isHost, true)
        XCTAssertEqual(r.count(for: r.players[0]), "22 / 25")
    }

    /// A pool past the board size can still leave someone short: the shortfall sets the number, the bar caps at full.
    func testNeedIsTheBiggestShortfallEvenPastTheBoardSize() {
        let r = LobbyReadiness(snapshot: snapshot(shortfalls: ["s2": 3], view: entries(30)))
        XCTAssertEqual(r.need, 3)
        XCTAssertEqual(r.progress, 1)
        XCTAssertEqual(r.status, "Need 3 more")
    }

    func testFreeSpaceTarget() {
        let r = LobbyReadiness(snapshot: snapshot(shortfalls: filling, view: entries(10), freeSpace: true))
        XCTAssertEqual(r.target, 24)
        XCTAssertEqual(r.label, "10 of 24 in the pool")
    }

    func testHostReady() {
        let r = LobbyReadiness(snapshot: snapshot(shortfalls: none, view: entries(25)))
        XCTAssertTrue(r.ready)
        XCTAssertEqual(r.need, 0)
        XCTAssertEqual(r.progress, 1)
        XCTAssertEqual(r.label, "Pool is full")
        XCTAssertEqual(r.status, "Ready to launch")
        XCTAssertEqual(r.lines, [])
        XCTAssertEqual(r.launchLabel, "Launch")
        XCTAssertEqual(r.allSetLabel, "4 players · all set")
        XCTAssertFalse(r.showsPlayerWaitingMini)
    }

    // MARK: Readiness (player) and the waiting copy

    func testPlayerFillingLineAndFooter() {
        let view = entries(18, viewerName: "Cody")
        let r = LobbyReadiness(snapshot: snapshot(me: "s2", shortfalls: filling, view: view))
        XCTAssertEqual(view.filter(\.mine).count, 5)
        XCTAssertEqual(r.lines, [LobbyReadiness.Line(text: "You've added 5 · 3 more to go", danger: true)])
        XCTAssertEqual(r.status, "Need 3 more", "players never read 'Waiting on host' while filling")
        XCTAssertEqual(r.playerFooter, "Pool needs 3 more tasks")
        XCTAssertFalse(r.showsPlayerWaitingMini, "nothing under Copy link while filling")
    }

    func testPlayerSetWhileOthersShort() {
        let r = LobbyReadiness(snapshot: snapshot(me: "s3", shortfalls: ["s2": 1], view: entries(24, viewerName: "Pat")))
        XCTAssertEqual(r.lines, [LobbyReadiness.Line(text: "You've added 6 · all set", danger: false)])
        XCTAssertEqual(r.playerFooter, "Pool needs 1 more task")
    }

    func testPlayerReady() {
        let r = LobbyReadiness(snapshot: snapshot(me: "s2", shortfalls: none, view: entries(25, viewerName: "Cody")))
        XCTAssertTrue(r.ready)
        XCTAssertEqual(r.status, "Waiting on host")
        XCTAssertEqual(r.playerFooter, "Waiting for host to start")
        XCTAssertTrue(r.showsPlayerWaitingMini)
        XCTAssertEqual(r.lines.map(\.text), ["You've added 6 · all set"])
    }

    func testNotReadyOutsideTheLobby() {
        let r = LobbyReadiness(snapshot: snapshot(shortfalls: none, view: entries(25), stage: .playing))
        XCTAssertFalse(r.ready)
    }

    // MARK: How tasks work

    func testExplainerGate() {
        let mine = [PoolViewEntry(taskId: "t1", authorName: "Cody", text: "x", mine: true)]
        let theirs = [PoolViewEntry(taskId: "t2", authorName: "Pat", text: "y", mine: false)]
        XCTAssertTrue(HowTasksWork.shouldAutoOpen(seen: false, stage: .lobby, entries: []))
        XCTAssertTrue(HowTasksWork.shouldAutoOpen(seen: false, stage: .lobby, entries: theirs))
        XCTAssertFalse(HowTasksWork.shouldAutoOpen(seen: true, stage: .lobby, entries: []))
        XCTAssertFalse(HowTasksWork.shouldAutoOpen(seen: false, stage: .lobby, entries: mine), "a reconnect after adding skips it")
        XCTAssertFalse(HowTasksWork.shouldAutoOpen(seen: false, stage: .playing, entries: []))
        XCTAssertFalse(HowTasksWork.shouldAutoOpen(seen: false, stage: .ended, entries: []))
    }

    func testExplainerSeenKey() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "howto-\(UUID().uuidString)"))
        XCTAssertEqual(HowTasksWork.seenKey, "oybc.howto.seen")
        XCTAssertFalse(HowTasksWork.hasSeen(defaults))
        HowTasksWork.markSeen(defaults)
        XCTAssertTrue(HowTasksWork.hasSeen(defaults))
        XCTAssertTrue(defaults.bool(forKey: "oybc.howto.seen"))
    }

    func testExplainerCopy() {
        XCTAssertEqual(HowTasksWork.kicker(.firstJoin(name: "Cody")), "Welcome, Cody")
        XCTAssertEqual(HowTasksWork.kicker(.info), "Pool")
        XCTAssertEqual(HowTasksWork.button(.firstJoin(name: "Cody")), "Got it, let's add some")
        XCTAssertEqual(HowTasksWork.button(.info), "Done")
        XCTAssertEqual(HowTasksWork.kinds.map(\.title), ["Plain", "@Name", "@someone", "@anyone"])
        let flat = HowTasksWork.kinds.map { k in (k.seen.map(\.text).joined(), k.dealt.map(\.text).joined()) }
        XCTAssertEqual(flat.map(\.0), ["Everyone", "Everyone except Name", "Only you", "Only you"])
        XCTAssertEqual(flat.map(\.1), ["Everyone", "Everyone except Name", "A random player on each board",
                                       "One board · counts when anyone but its owner does it"])
    }

    // MARK: Wire

    func testGameNameDecodesWhenPresentAndAbsent() throws {
        let base = #""code":"HX7KQ","stage":"lobby","hostSeatId":"s1","createdAt":1,"bingoCount":0,"shortfalls":{},"reviewGate":false"#
        let with = try JSONDecoder().decode(GameDoc.self, from: Data("{\(base),\"gameName\":\"Halloween at Stephen's\"}".utf8))
        XCTAssertEqual(with.gameName, "Halloween at Stephen's")
        let without = try JSONDecoder().decode(GameDoc.self, from: Data("{\(base)}".utf8))
        XCTAssertNil(without.gameName)
    }

    func testCreateRequestBody() throws {
        let plain = try JSONSerialization.jsonObject(with: JSONEncoder().encode(CreateGameReq(name: "Stephen"))) as? [String: Any]
        XCTAssertEqual(plain?["name"] as? String, "Stephen")
        XCTAssertNil(plain?["gameName"], "no game name is omitted")
        XCTAssertEqual(plain?["freeSpace"] as? Bool, false)
        let full = try JSONSerialization.jsonObject(with: JSONEncoder().encode(
            CreateGameReq(name: "Stephen", gameName: "Halloween", freeSpace: true))) as? [String: Any]
        XCTAssertEqual(full?["gameName"] as? String, "Halloween")
        XCTAssertEqual(full?["freeSpace"] as? Bool, true)
    }
}
