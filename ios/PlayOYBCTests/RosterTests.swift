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

    private func rows(_ partial: String, seats: [String] = ["Jordan", "Pat"], selfName: String? = "Stephen") -> [Mentions.Option] {
        Mentions.options(partial: partial, seatNames: seats, roster: roster, selfName: selfName)
    }

    func testOrderPlayersBoundUnboundKeywords() {
        XCTAssertEqual(rows(""), [
            .init(name: "Jordan", kind: .player), .init(name: "Pat", kind: .player),
            .init(name: "Jess", kind: .bound),
            .init(name: "Jo", kind: .unbound), .init(name: "Max", kind: .unbound),
            .init(name: "someone", kind: .keyword), .init(name: "anyone", kind: .keyword),
        ])
        XCTAssertEqual(rows("j").map(\.kind), [.player, .bound, .unbound, .add])
        XCTAssertEqual(rows("J").map(\.name), ["Jordan", "Jess", "Jo", "J"])
    }

    func testAddRowOnlyForANewValidName() {
        XCTAssertEqual(rows("Kim").last, .init(name: "Kim", kind: .add))
        XCTAssertEqual(rows("Kim").count, 1)
        XCTAssertEqual(rows("O’Neil").last?.kind, .add)
        // Exact matches of a player or a roster name, any case: no add row.
        XCTAssertFalse(rows("jordan").contains { $0.kind == .add })
        XCTAssertFalse(rows("JO").contains { $0.kind == .add })
        XCTAssertFalse(rows("jess").contains { $0.kind == .add })
        // Yourself, and near-misses of a player here (the server refuses "@Jor" with Jordan seated).
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
        let w = await host(AddTaskView(service: FakeGameService(), gameId: "g1", seatNames: ["Jordan"], roster: roster, selfName: "Stephen"))
        w.isHidden = true
    }
}
