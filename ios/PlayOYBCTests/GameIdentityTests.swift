import SwiftUI
import XCTest
@testable import PlayOYBC

/// The game's identity on the wire: `whoAmI` / `welcome` carry the game name and host name.
final class GameIdentityWireTests: XCTestCase {
    private func whoAmI(_ json: String) throws -> WhoAmIRes {
        try JSONDecoder().decode(WhoAmIRes.self, from: Data(json.utf8))
    }

    func testWhoAmIDecodesFullShape() throws {
        XCTAssertEqual(try whoAmI(#"{"gameId":"g1","seatId":"s1","gameName":"Friendsgiving","hostName":"Stephen"}"#),
                       WhoAmIRes(gameId: "g1", seatId: "s1", gameName: "Friendsgiving", hostName: "Stephen"))
    }

    func testWhoAmIDecodesUnseatedWithoutGameName() throws {
        XCTAssertEqual(try whoAmI(#"{"gameId":"g1","seatId":null,"hostName":"Stephen"}"#),
                       WhoAmIRes(gameId: "g1", seatId: nil, gameName: nil, hostName: "Stephen"))
        XCTAssertEqual(try whoAmI(#"{"gameId":"g1","hostName":"Stephen"}"#),
                       WhoAmIRes(gameId: "g1", seatId: nil, gameName: nil, hostName: "Stephen"))
    }

    func testWhoAmIDecodesOldShape() throws {
        XCTAssertEqual(try whoAmI(#"{"gameId":"g1","seatId":"s1"}"#), WhoAmIRes(gameId: "g1", seatId: "s1"))
    }

    func testWhoAmIRoundTripsOmittingNils() throws {
        let data = try JSONEncoder().encode(WhoAmIRes(gameId: "g1", seatId: nil))
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(obj.keys), ["gameId"])
    }

    private func welcome(_ json: String) throws -> ServerFrame {
        try JSONDecoder().decode(ServerFrame.self, from: Data(json.utf8))
    }

    func testWelcomeCarriesGameAndHostName() throws {
        let frame = try welcome(#"{"t":"welcome","uid":"u1","gameId":"g1","seatId":"s2","stage":"lobby","rev":3,"gameName":"Friendsgiving","hostName":"Stephen"}"#)
        XCTAssertEqual(frame, .welcome(Welcome(uid: "u1", gameId: "g1", seatId: "s2", stage: .lobby, rev: 3,
                                               gameName: "Friendsgiving", hostName: "Stephen")))
    }

    func testWelcomeWithoutNewFieldsStillDecodes() throws {
        let frame = try welcome(#"{"t":"welcome","uid":"u1","gameId":"g1","seatId":null,"stage":"lobby","rev":3}"#)
        XCTAssertEqual(frame, .welcome(Welcome(uid: "u1", gameId: "g1", seatId: nil, stage: .lobby, rev: 3)))
    }
}

@MainActor
final class JoinGameIdentityTests: XCTestCase {
    func testUnseatedAnswerShowsNameFormWithHeader() async {
        let fake = FakeGameService()
        fake.whoAmIResult = WhoAmIRes(gameId: "g1", seatId: nil, gameName: "Friendsgiving", hostName: "Stephen")
        let vm = JoinViewModel(service: fake, code: "ABCDE")
        await vm.check()
        XCTAssertEqual(vm.phase, .name)
        XCTAssertEqual(vm.gameName, "Friendsgiving")
        XCTAssertEqual(vm.hostName, "Stephen")
    }

    func testSeatedAnswerSeatsAndKeepsHeader() async {
        let fake = FakeGameService()
        fake.whoAmIResult = WhoAmIRes(gameId: "g1", seatId: "s3", gameName: "Friendsgiving", hostName: "Stephen")
        let vm = JoinViewModel(service: fake, code: "ABCDE")
        await vm.check()
        XCTAssertEqual(vm.phase, .seated(gameId: "g1", seatId: "s3"))
        XCTAssertEqual(vm.gameName, "Friendsgiving")
        XCTAssertEqual(vm.hostName, "Stephen")
    }

    func testNoGameNameLeavesOnlyHost() async {
        let fake = FakeGameService()
        fake.whoAmIResult = WhoAmIRes(gameId: "g1", seatId: nil, gameName: "  ", hostName: "Stephen")
        let vm = JoinViewModel(service: fake, code: "ABCDE")
        await vm.check()
        XCTAssertEqual(vm.phase, .name)
        XCTAssertNil(vm.gameName)
        XCTAssertEqual(vm.hostName, "Stephen")
    }

    func testOldBackendNilAnswerAsksForName() async {
        let fake = FakeGameService()
        fake.whoAmIResult = nil
        let vm = JoinViewModel(service: fake, code: "ABCDE")
        await vm.check()
        XCTAssertEqual(vm.phase, .name)
        XCTAssertNil(vm.gameName)
        XCTAssertNil(vm.hostName)
    }

    func testResumeIgnoresUnseatedAnswer() async {
        let fake = FakeGameService()
        fake.whoAmIResult = WhoAmIRes(gameId: "g9", seatId: nil, gameName: "Friendsgiving", hostName: "Stephen")
        let d = UserDefaults(suiteName: "gameIdentity.resume")!
        d.removePersistentDomain(forName: "gameIdentity.resume")
        let st = ResumeStore(defaults: d); st.save(code: "ABCDE")
        let model = AppModel(service: fake, store: st)
        await model.launch()
        XCTAssertNil(model.resumed)
        XCTAssertEqual(model.route, .home)
        XCTAssertNil(st.load())
    }
}

/// Renders the headers with and without a game name; the board header's name never wraps the row.
@MainActor
final class GameIdentityRenderTests: XCTestCase {
    private let seats = [
        Seat(seatId: "s1", doc: SeatDoc(name: "Stephen", nameKey: "stephen", joinedAt: 1)),
        Seat(seatId: "s2", doc: SeatDoc(name: "Jordan", nameKey: "jordan", joinedAt: 2)),
    ]
    private let longName = String(repeating: "Friendsgiving bingo night ", count: 4)
    private let width: CGFloat = 361

    private func size<V: View>(_ view: V) -> CGSize {
        let vc = UIHostingController(rootView: view)
        return vc.sizeThatFits(in: CGSize(width: width, height: CGFloat.greatestFiniteMagnitude))
    }

    private func host<V: View>(_ view: V) async {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let vc = UIHostingController(rootView: view)
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        try? await _Concurrency.Task.sleep(nanoseconds: 100_000_000)
        XCTAssertFalse(vc.view.bounds.isEmpty)
        window.isHidden = true
    }

    func testBoardHeaderLongNameKeepsOneRow() async {
        let plain = size(FocusHarness { BoardHeaderView(code: "HX7KQ", showsMenu: true, menuFocus: $0, onLeaderboard: {}, onMenu: {}) })
        let named = size(FocusHarness {
            BoardHeaderView(code: "HX7KQ", gameName: self.longName, showsMenu: true, menuFocus: $0, onLeaderboard: {}, onMenu: {})
        })
        XCTAssertEqual(named.height, plain.height, accuracy: 0.5)
        XCTAssertLessThanOrEqual(named.width, width + 0.5)
        await host(FocusHarness { BoardHeaderView(code: "HX7KQ", gameName: "Friendsgiving", showsMenu: false, menuFocus: $0,
                                                  onLeaderboard: {}, onMenu: {}) })
    }

    func testLobbyHeaderWithAndWithoutName() async {
        for name in [nil, "Friendsgiving", longName] as [String?] {
            await host(FocusHarness {
                LobbyHeaderView(count: "18 / 25", gameName: name, poolSize: 30, seats: self.seats, playersOpen: false,
                                showsMenu: true, menuFocus: $0, onTogglePlayers: {}, onMenu: {})
            })
        }
    }

    func testJoinIdentityAndEndedRender() async {
        await host(JoinGameIdentity(gameName: "Friendsgiving", hostName: "Stephen"))
        await host(JoinGameIdentity(gameName: nil, hostName: "Stephen"))
        for name in [nil, "Friendsgiving"] as [String?] {
            let snap = GameSnapshot(game: GameDoc(code: "ABCDE", stage: .ended, hostSeatId: "s1", createdAt: 1, launchedAt: 2,
                                                  endedAt: 3, bingoCount: 0, shortfalls: [:], reviewGate: false, gameName: name),
                                    mySeatId: "s2", seats: seats, view: [], board: nil, bingos: [], reclaims: [])
            await host(EndedView(snapshot: snap))
            await host(PlayerListView(snapshot: snap))
        }
    }
}

/// Supplies the VoiceOver focus binding the headers take.
private struct FocusHarness<Content: View>: View {
    @AccessibilityFocusState private var focus: Bool
    let content: (AccessibilityFocusState<Bool>.Binding) -> Content

    init(@ViewBuilder content: @escaping (AccessibilityFocusState<Bool>.Binding) -> Content) { self.content = content }

    var body: some View { content($focus) }
}
