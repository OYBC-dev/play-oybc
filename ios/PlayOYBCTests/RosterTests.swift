import SwiftUI
import XCTest
@testable import PlayOYBC

/// Roster (names the pool mentions that no seat owns): autocomplete rows, wire decoding, the
/// bindName / retireName calls and the lobby views that show it.
final class RosterMentionsTests: XCTestCase {
    private let roster = [
        RosterName(key: "jess", display: "Jess", seatId: "s2"),
        RosterName(key: "jo", display: "Jo", seatId: nil),
        RosterName(key: "max", display: "Max", seatId: nil),
    ]

    private func rows(_ partial: String, seats: [String] = ["Jordan", "Pat"], selfName: String? = "Stephen",
                      selfSeatId: String? = "s1") -> [Mentions.Option] {
        Mentions.options(partial: partial, seatNames: seats, roster: roster, selfName: selfName, selfSeatId: selfSeatId)
    }

    func testOrderPlayersBoundUnboundKeywords() {
        XCTAssertEqual(rows(""), [
            .init(name: "Jordan", kind: .player), .init(name: "Pat", kind: .player),
            .init(name: "Jess", kind: .bound),
            .init(name: "Jo", kind: .unbound), .init(name: "Max", kind: .unbound),
            .init(name: "someone", kind: .keyword), .init(name: "anyone", kind: .keyword),
        ])
        // One character never offers the add row.
        XCTAssertEqual(rows("j").map(\.kind), [.player, .bound, .unbound])
        XCTAssertEqual(rows("J").map(\.name), ["Jordan", "Jess", "Jo"])
    }

    /// The handoff fixture: Stephen (you, host), C-Dog, Sam, Priya, Marcus, Tess; Cody → C-Dog,
    /// Krispy and Seth unbound. Frames 1a–1d.
    func testHandoffFrames() {
        let others = ["C-Dog", "Sam", "Priya", "Marcus", "Tess"]
        let roster = [RosterName(key: "cody", display: "Cody", seatId: "s2"),
                      RosterName(key: "krispy", display: "Krispy", seatId: nil),
                      RosterName(key: "seth", display: "Seth", seatId: nil)]
        func rows(_ p: String) -> [Mentions.Option] {
            Mentions.options(partial: p, seatNames: others, roster: roster, selfName: "Stephen", selfSeatId: "s1")
        }
        XCTAssertEqual(rows("").map(\.name), others + ["Cody", "Krispy", "Seth", "someone", "anyone"])
        XCTAssertEqual(rows("C"), [.init(name: "C-Dog", kind: .player), .init(name: "Cody", kind: .bound)])
        XCTAssertEqual(rows("Kr"), [.init(name: "Krispy", kind: .unbound), .init(name: "Kr", kind: .add)])
        XCTAssertEqual(rows("Jess"), [.init(name: "Jess", kind: .add)])
    }

    func testAddRowNeedsTwoCharacters() {
        XCTAssertEqual(Mentions.minAddLength, 2)
        XCTAssertFalse(rows("K").contains { $0.kind == .add })
        XCTAssertEqual(rows("Ki"), [.init(name: "Ki", kind: .add)])
    }

    func testYourselfAndNamesBoundToYouAreNotOffered() {
        // Jess is bound to s2: as s2, Jess would be a self-mention.
        XCTAssertFalse(rows("", seats: ["Stephen", "Pat"], selfName: "Jordan", selfSeatId: "s2").contains { $0.name == "Jess" })
        XCTAssertTrue(rows("", seats: ["Jordan", "Pat"], selfName: "Stephen", selfSeatId: "s1").contains { $0.name == "Jess" })
        // Never your own name, and typing a name bound to you exactly offers no add row either.
        XCTAssertFalse(rows("Ste").contains { $0.name.hasPrefix("Ste") })
        XCTAssertFalse(rows("jess", seats: ["Stephen"], selfName: "Jordan", selfSeatId: "s2").contains { $0.kind == .add })
    }

    func testNoAddRowWhileTypingAPresentName() {
        // "Pa" is Pat (or yourself, "Steph") being typed: no add row.
        XCTAssertFalse(rows("Pa").contains { $0.kind == .add })
        XCTAssertFalse(rows("Steph").contains { $0.kind == .add })
        XCTAssertFalse(rows("so", seats: []).contains { $0.kind == .add })
        // A prefix of a roster name is a new name (frame 1c: "Kr" next to Krispy).
        XCTAssertEqual(rows("Ma").last, .init(name: "Ma", kind: .add))
    }

    func testReturnNeverPicksTheAddRow() {
        XCTAssertEqual(Mentions.returnPick(rows("J")), .init(name: "Jordan", kind: .player))
        XCTAssertNil(Mentions.returnPick(rows("Kim")))
        XCTAssertNil(Mentions.returnPick([]))
        // An add row after a match: Return still picks the match.
        XCTAssertEqual(Mentions.returnPick(rows("Ma")), .init(name: "Max", kind: .unbound))
    }

    func testAddRowOnlyForANewValidName() {
        XCTAssertEqual(rows("Kim").last, .init(name: "Kim", kind: .add))
        XCTAssertEqual(rows("Kim").count, 1)
        XCTAssertEqual(rows("O’Neil").last?.kind, .add)
        // Exact matches of a player or a roster name, any case: no add row.
        XCTAssertFalse(rows("jordan").contains { $0.kind == .add })
        XCTAssertFalse(rows("JO").contains { $0.kind == .add })
        XCTAssertFalse(rows("jess").contains { $0.kind == .add })
        // Yourself, and near-misses / prefixes of a player here (the server refuses "@Jor" with Jordan seated).
        XCTAssertFalse(rows("stephen").contains { $0.kind == .add })
        XCTAssertFalse(rows("Jor").contains { $0.kind == .add })
        XCTAssertFalse(rows("Jordans").contains { $0.kind == .add })
        // Empty, invalid, too long, two words, or a finished word.
        XCTAssertFalse(rows("").contains { $0.kind == .add })
        XCTAssertFalse(rows("Kim!").contains { $0.kind == .add })
        XCTAssertFalse(rows(String(repeating: "a", count: 21)).contains { $0.kind == .add })
        XCTAssertFalse(rows("Kim is").contains { $0.kind == .add })
        XCTAssertFalse(rows("Kim ").contains { $0.kind == .add })
    }

    func testKeywordsNeverAdd() {
        for p in ["someone", "Someone", "ANYONE", "anyone", "some", "any"] {
            XCTAssertFalse(rows(p, seats: []).contains { $0.kind == .add }, p)
        }
        XCTAssertEqual(rows("someone", seats: []).map(\.name), ["someone"])
    }

    func testPickInsertsTheNameForEveryKind() {
        let m = Mentions.active(in: "hi @Je", caret: 6)!
        XCTAssertEqual(Mentions.pick("Jess", mention: m, in: "hi @Je", caret: 6).text, "hi @Jess ")
        let n = Mentions.active(in: "@Kim", caret: 4)!
        let add = rows(n.partial).last!
        XCTAssertEqual(add.kind, .add)
        XCTAssertEqual(Mentions.pick(add.name, mention: n, in: "@Kim", caret: 4).text, "@Kim ")
    }

    func testNormalizeName() {
        XCTAssertEqual(Mentions.normalizeName("  Mary   Jo "), "Mary Jo")
        XCTAssertNil(Mentions.normalizeName("   "))
        XCTAssertNil(Mentions.normalizeName("Someone"))
        XCTAssertNil(Mentions.normalizeName("a@b"))
        XCTAssertEqual(Mentions.key(" O’Neil  B "), "o'neil b")
    }

    func testErrorCopy() {
        XCTAssertEqual(ErrorMessages.message(for: AppError(code: "name-not-found", token: nil, underlying: nil)), "That name is gone")
        XCTAssertEqual(ErrorMessages.message(for: AppError(code: "seat-not-found", token: nil, underlying: nil)), "That player left")
    }
}

final class RosterDecodingTests: XCTestCase {
    private let gameJSON = #"{"code":"ABCDE","stage":"lobby","hostSeatId":"s1","createdAt":1,"bingoCount":0,"shortfalls":{},"reviewGate":false}"#

    func testRosterSectionDecodes() throws {
        let frame = try JSONDecoder().decode(ServerFrame.self, from: Data(#"""
        {"t":"state","rev":3,"roster":[{"key":"jess","display":"Jess","seatId":"s2"},{"key":"jo","display":"Jo","seatId":null}]}
        """#.utf8))
        guard case let .state(s) = frame else { return XCTFail("not a state frame") }
        XCTAssertEqual(s.roster, [RosterName(key: "jess", display: "Jess", seatId: "s2"), RosterName(key: "jo", display: "Jo", seatId: nil)])
        XCTAssertNil(s.game)
    }

    func testAbsentRosterStaysAbsent() throws {
        let frame = try JSONDecoder().decode(ServerFrame.self, from: Data(#"{"t":"state","rev":3,"game":\#(gameJSON)}"#.utf8))
        guard case let .state(s) = frame else { return XCTFail("not a state frame") }
        XCTAssertNil(s.roster)
        XCTAssertEqual(GameSnapshot(game: s.game!, mySeatId: "s1", seats: [], view: [], board: nil, bingos: [], reclaims: []).roster, [])
    }

    func testRosterNameWithoutSeatIdKey() throws {
        let n = try JSONDecoder().decode(RosterName.self, from: Data(#"{"key":"jo","display":"Jo"}"#.utf8))
        XCTAssertNil(n.seatId)
    }

    func testExistingFixturesStillDecode() throws {
        let bundle = Bundle(for: Self.self)
        func load<T: Decodable>(_ t: T.Type, _ name: String) throws -> T {
            let url = try XCTUnwrap(bundle.url(forResource: name, withExtension: "json"), name)
            return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
        }
        _ = try load(GameDoc.self, "game")
        _ = try load(GameDoc.self, "game-lobby")
        _ = try load(SeatDoc.self, "seat")
        _ = try load(ViewDoc.self, "view")
        _ = try load(BoardDoc.self, "board")
        _ = try load(BingoDoc.self, "bingo")
        _ = try load(ReclaimDoc.self, "reclaim")
        _ = try load(ToggleMarkRes.self, "toggle-res")
        _ = try load(JoinGameRes.self, "join-joined")
        _ = try load(JoinGameRes.self, "join-reclaim")
    }

    func testBindNameArgsSendExplicitNull() throws {
        let unbind = try JSONSerialization.data(withJSONObject: WebSocketGameService.bindNameArgs(key: "jess", seatId: nil), options: .sortedKeys)
        XCTAssertEqual(String(data: unbind, encoding: .utf8), #"{"key":"jess","seatId":null}"#)
        let bind = try JSONSerialization.data(withJSONObject: WebSocketGameService.bindNameArgs(key: "jess", seatId: "s2"), options: .sortedKeys)
        XCTAssertEqual(String(data: bind, encoding: .utf8), #"{"key":"jess","seatId":"s2"}"#)
    }
}

@MainActor
final class NameBindingModelTests: XCTestCase {
    private func spin(until done: () -> Bool) async {
        for _ in 0..<200 where !done() { try? await _Concurrency.Task.sleep(nanoseconds: 5_000_000) }
    }

    func testBindAndUnbindSendTheOps() async {
        let fake = FakeGameService()
        let model = NameBindingModel(service: fake, gameId: "g1", key: "jess")
        await model.bind("s2", current: nil)
        await model.bind(nil, current: "s2")
        XCTAssertEqual(fake.calls, ["bindName:jess:s2", "bindName:jess:nil"])
        XCTAssertFalse(model.busy)
    }

    func testSameBindingIsANoOp() async {
        let fake = FakeGameService()
        let model = NameBindingModel(service: fake, gameId: "g1", key: "jess")
        await model.bind("s2", current: "s2")
        await model.bind(nil, current: nil)
        XCTAssertEqual(fake.calls, [])
    }

    func testInFlightGateDropsASecondTap() async {
        let fake = FakeGameService()
        fake.gateRoster = true
        let model = NameBindingModel(service: fake, gameId: "g1", key: "jess")
        let first = _Concurrency.Task { await model.bind("s2", current: nil) }
        await spin { fake.parkedRosterCalls == 1 }
        XCTAssertTrue(model.busy)
        await model.bind("s3", current: nil)
        let retired = await model.retire()
        XCTAssertFalse(retired)
        XCTAssertEqual(fake.calls, ["bindName:jess:s2"])
        fake.releaseRoster()
        await first.value
        XCTAssertFalse(model.busy)
    }

    func testPendingPickHoldsUntilTheRosterAgrees() async {
        let fake = FakeGameService()
        let model = NameBindingModel(service: fake, gameId: "g1", key: "jess")
        XCTAssertNil(model.selection(current: nil))
        await model.bind("s2", current: nil)
        // The call returned but no frame yet: the tapped row stays selected.
        XCTAssertEqual(model.pending, .init(seatId: "s2"))
        XCTAssertEqual(model.selection(current: nil), "s2")
        // A stale frame does not clear it.
        model.observe(current: nil)
        XCTAssertEqual(model.selection(current: nil), "s2")
        // The frame that carries the binding does.
        model.observe(current: "s2")
        XCTAssertNil(model.pending)
        XCTAssertEqual(model.selection(current: "s2"), "s2")
        // Unbinding is a pick too ("Nobody yet").
        await model.bind(nil, current: "s2")
        XCTAssertEqual(model.pending, .init(seatId: nil))
        XCTAssertNil(model.selection(current: "s2"))
        model.observe(current: nil)
        XCTAssertNil(model.pending)
        // Tapping the pending row again is a no-op.
        await model.bind("s3", current: nil)
        await model.bind("s3", current: nil)
        XCTAssertEqual(fake.calls, ["bindName:jess:s2", "bindName:jess:nil", "bindName:jess:s3"])
    }

    func testFailedBindDropsThePendingPick() async {
        let fake = FakeGameService()
        fake.callError = AppError(code: "seat-not-found", token: nil, underlying: nil)
        let model = NameBindingModel(service: fake, gameId: "g1", key: "jess")
        await model.bind("s9", current: nil)
        XCTAssertNil(model.pending)
        XCTAssertNil(model.selection(current: nil))
    }

    func testBindErrorShowsCopy() async {
        let fake = FakeGameService()
        fake.callError = AppError(code: "seat-not-found", token: nil, underlying: nil)
        let model = NameBindingModel(service: fake, gameId: "g1", key: "jess")
        await model.bind("s9", current: nil)
        XCTAssertEqual(model.error, "That player left")
    }

    func testRetireSendsTheOp() async {
        let fake = FakeGameService()
        let model = NameBindingModel(service: fake, gameId: "g1", key: "jo")
        let ok = await model.retire()
        XCTAssertTrue(ok)
        XCTAssertEqual(fake.calls, ["retireName:jo"])
        XCTAssertFalse(model.retiring)
    }

    func testRetireFailureKeepsTheSheetAndShowsCopy() async {
        let fake = FakeGameService()
        fake.callError = AppError(code: "name-not-found", token: nil, underlying: nil)
        let model = NameBindingModel(service: fake, gameId: "g1", key: "jo")
        let ok = await model.retire()
        XCTAssertFalse(ok)
        XCTAssertEqual(model.retireError, "That name is gone")
        model.clearRetireError()
        XCTAssertNil(model.retireError)
    }
}

/// Launch asks first while unbound roster names remain.
@MainActor
final class LaunchConfirmTests: XCTestCase {
    private let roster = [
        RosterName(key: "cody", display: "Cody", seatId: "s2"),
        RosterName(key: "krispy", display: "Krispy", seatId: nil),
        RosterName(key: "seth", display: "Seth", seatId: nil),
    ]

    func testUnboundRosterNames() {
        XCTAssertEqual(LobbyLogic.unboundRosterNames(roster).map(\.display), ["Krispy", "Seth"])
        XCTAssertEqual(LobbyLogic.unboundRosterNames([roster[0]]), [])
        XCTAssertEqual(LobbyLogic.unboundRosterNames([]), [])
    }

    func testLaunchWithUnboundNamesAsksFirst() async {
        let fake = FakeGameService()
        let model = LaunchModel()
        await model.request(roster: roster) { try await fake.launch(gameId: "g1") }
        XCTAssertEqual(fake.calls, [])
        XCTAssertEqual(model.confirming.map(\.display), ["Krispy", "Seth"])
        model.cancel()
        XCTAssertEqual(model.confirming, [])
        XCTAssertEqual(fake.calls, [])
        await model.request(roster: roster) { try await fake.launch(gameId: "g1") }
        await model.confirm { try await fake.launch(gameId: "g1") }
        XCTAssertEqual(fake.calls, ["launch"])
        XCTAssertEqual(model.confirming, [])
        XCTAssertFalse(model.busy)
    }

    func testLaunchWithoutUnboundNamesFiresDirectly() async {
        let fake = FakeGameService()
        let model = LaunchModel()
        await model.request(roster: [roster[0]]) { try await fake.launch(gameId: "g1") }
        await model.request(roster: []) { try await fake.launch(gameId: "g1") }
        XCTAssertEqual(fake.calls, ["launch", "launch"])
        XCTAssertEqual(model.confirming, [])
        // Confirm with nothing to confirm does nothing.
        await model.confirm { try await fake.launch(gameId: "g1") }
        XCTAssertEqual(fake.calls, ["launch", "launch"])
    }

    func testLaunchFailureShowsCopy() async {
        let fake = FakeGameService()
        fake.callError = AppError(code: "seat-not-found", token: nil, underlying: nil)
        let model = LaunchModel()
        await model.request(roster: []) { try await fake.launch(gameId: "g1") }
        XCTAssertEqual(model.error, "That player left")
    }
}

/// The host menu's Roster item: host only, in the lobby, once the roster has a name; the count is
/// the unbound names.
@MainActor
final class RosterMenuTests: XCTestCase {
    private let seats = [
        Seat(seatId: "s1", doc: SeatDoc(name: "Stephen", nameKey: "stephen", joinedAt: 1)),
        Seat(seatId: "s2", doc: SeatDoc(name: "C-Dog", nameKey: "c-dog", joinedAt: 2)),
    ]

    private func snapshot(me: String, roster: [RosterName], stage: Stage = .lobby) -> GameSnapshot {
        GameSnapshot(game: GameDoc(code: "ABCDE", stage: stage, hostSeatId: "s1", createdAt: 1, launchedAt: nil, endedAt: nil,
                                   bingoCount: 0, shortfalls: [:], reviewGate: false),
                     mySeatId: me, seats: seats, view: [], board: nil, bingos: [], reclaims: [], roster: roster)
    }

    private let roster = [
        RosterName(key: "cody", display: "Cody", seatId: "s2"),
        RosterName(key: "krispy", display: "Krispy", seatId: nil),
        RosterName(key: "seth", display: "Seth", seatId: nil),
    ]

    func testHostSeesRosterWithUnboundCount() {
        let m = HostMenuModel(snapshot: snapshot(me: "s1", roster: roster), canEnd: true)
        XCTAssertTrue(m.showsRoster)
        XCTAssertEqual(m.unboundCount, 2)
        let allBound = HostMenuModel(snapshot: snapshot(me: "s1", roster: [roster[0]]), canEnd: true)
        XCTAssertTrue(allBound.showsRoster)
        XCTAssertEqual(allBound.unboundCount, 0)
    }

    func testGuestEmptyRosterAndPlayGetNoRoster() {
        XCTAssertFalse(HostMenuModel(snapshot: snapshot(me: "s2", roster: roster), canEnd: true).showsRoster)
        XCTAssertFalse(HostMenuModel(snapshot: snapshot(me: "s1", roster: []), canEnd: true).showsRoster)
        XCTAssertFalse(HostMenuModel(snapshot: snapshot(me: "s1", roster: roster, stage: .playing), canEnd: true).showsRoster)
    }

    /// Renders the card (it must lay out) and returns it for its Roster row state.
    private func render(_ model: HostMenuModel) async -> HostMenuCard {
        let card = HostMenuCard(model: model, onMakeHost: {}, onEndGame: {}, onLeave: {}, onClose: {}, onRoster: {})
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let vc = UIHostingController(rootView: card.frame(width: 216))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        let end = Date().addingTimeInterval(0.2)
        while Date() < end { try? await _Concurrency.Task.sleep(nanoseconds: 10_000_000) }
        XCTAssertFalse(vc.view.bounds.isEmpty)
        window.isHidden = true
        return card
    }

    func testCardShowsRosterAndCountForTheHostOnly() async {
        let host = await render(HostMenuModel(snapshot: snapshot(me: "s1", roster: roster), canEnd: true))
        XCTAssertTrue(host.showsRoster)
        XCTAssertEqual(host.rosterCount, "2")
        let bound = await render(HostMenuModel(snapshot: snapshot(me: "s1", roster: [roster[0]]), canEnd: true))
        XCTAssertTrue(bound.showsRoster)
        XCTAssertNil(bound.rosterCount)
        let guest = await render(HostMenuModel(snapshot: snapshot(me: "s2", roster: roster), canEnd: true))
        XCTAssertFalse(guest.showsRoster)
        // A screen that does not handle Roster (the board) leaves it out.
        let board = HostMenuCard(model: HostMenuModel(snapshot: snapshot(me: "s1", roster: roster), canEnd: true),
                                 onMakeHost: {}, onEndGame: {}, onLeave: {}, onClose: {})
        XCTAssertFalse(board.showsRoster)
    }
}

/// Hosts the roster surfaces in a window so they at least lay out and render.
@MainActor
final class RosterViewHostingTests: XCTestCase {
    private let seats = [
        Seat(seatId: "s1", doc: SeatDoc(name: "Stephen", nameKey: "stephen", joinedAt: 1)),
        Seat(seatId: "s2", doc: SeatDoc(name: "Jordan", nameKey: "jordan", joinedAt: 2)),
    ]
    private let roster = [
        RosterName(key: "jess", display: "Jess", seatId: "s2"),
        RosterName(key: "kim", display: "Kim", seatId: "s2"),
        RosterName(key: "jo", display: "Jo", seatId: nil),
    ]

    private func snapshot(me: String) -> GameSnapshot {
        GameSnapshot(game: GameDoc(code: "ABCDE", stage: .lobby, hostSeatId: "s1", createdAt: 1, launchedAt: nil, endedAt: nil,
                                   bingoCount: 0, shortfalls: [:], reviewGate: false),
                     mySeatId: me, seats: seats, view: [], board: nil, bingos: [], reclaims: [], roster: roster)
    }

    private func host<V: View>(_ view: V) async -> UIWindow {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let vc = UIHostingController(rootView: view)
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        let end = Date().addingTimeInterval(0.2)
        while Date() < end { try? await _Concurrency.Task.sleep(nanoseconds: 10_000_000) }
        XCTAssertFalse(vc.view.bounds.isEmpty)
        return window
    }

    func testLobbyRendersForHostAndGuestWithRoster() async {
        for me in ["s1", "s2"] {
            let w = await host(LobbyView(service: FakeGameService(), snapshot: snapshot(me: me), gameId: "g1", playersOpen: true))
            w.isHidden = true
        }
    }

    func testLobbyWithBindSheetOpen() async {
        let w = await host(LobbyView(service: FakeGameService(), snapshot: snapshot(me: "s1"), gameId: "g1", playersOpen: true,
                                     bindingKey: "jo"))
        w.isHidden = true
    }

    func testPlayerListHostAndGuest() async {
        var opened: [String] = []
        let w1 = await host(PlayerListView(snapshot: snapshot(me: "s1"), onOpen: { opened.append($0) }))
        let w2 = await host(PlayerListView(snapshot: snapshot(me: "s2")))
        w1.isHidden = true
        w2.isHidden = true
        XCTAssertEqual(opened, [])
    }

    func testBindSheetRendersPlainAndConfirming() async {
        for confirming in [false, true] {
            let w = await host(BindNameSheetView(name: roster[2], seats: seats, service: FakeGameService(), gameId: "g1",
                                                 confirming: confirming, onDone: {}))
            w.isHidden = true
        }
    }

    func testComposerWithRoster() async {
        let w = await host(AddTaskView(service: FakeGameService(), gameId: "g1", seatNames: ["Jordan"], roster: roster, selfName: "Stephen",
                                       seats: seats, selfSeatId: "s1"))
        w.isHidden = true
    }

    func testLobbyWithLaunchableRoster() async {
        // The Launch confirm itself opens from a tap; this only checks the lobby with unbound names still renders.
        for me in ["s1", "s2"] {
            let w = await host(LobbyView(service: FakeGameService(), snapshot: snapshot(me: me), gameId: "g1", hostMenu: .menu))
            w.isHidden = true
        }
    }

    func testBindSheetForABoundName() async {
        let w = await host(BindNameSheetView(name: roster[0], seats: seats, service: FakeGameService(), gameId: "g1", onDone: {}))
        w.isHidden = true
    }
}
