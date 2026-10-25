import SnapshotTesting
import SwiftUI
import XCTest
@testable import PlayOYBC

/// Visual baselines for every Play screen, light and dark, at iPhone 17 width.
@MainActor
final class ScreenSnapshotTests: XCTestCase {
    private let recordMode: SnapshotTestingConfiguration.Record? = .missing
    private typealias F = SnapshotFixtures

    /// Asserts one baseline per colour scheme (`<test>.light.png` / `<test>.dark.png`).
    /// `drawHierarchy` renders through the window so SwiftUI blur filters show (the lobby's
    /// hidden rows); the default layer render drops them.
    private func assertBoth<V: View>(_ view: V, height: CGFloat, drawHierarchy: Bool = false, file: StaticString = #filePath, testName: String = #function, line: UInt = #line) {
        for (name, style, scheme) in [("light", UIUserInterfaceStyle.light, ColorScheme.light), ("dark", .dark, .dark)] {
            let v = view.environment(\.colorScheme, scheme)
            assertSnapshot(of: v, as: .image(drawHierarchyInKeyWindow: drawHierarchy, layout: .fixed(width: 393, height: height),
                                             traits: UITraitCollection(userInterfaceStyle: style)),
                           named: name, record: recordMode, file: file, testName: testName, line: line)
        }
    }

    func testHome() {
        assertBoth(HomeView(service: FakeGameService(), onHosted: { _, _, _ in }, onJoin: { _ in }, name: "Stephen", code: "HX7KQ"), height: 720)
    }

    func testHomeEmpty() {
        assertBoth(HomeView(service: FakeGameService(), onHosted: { _, _, _ in }, onJoin: { _ in }), height: 720)
    }

    func testHomeWithResume() {
        assertBoth(HomeView(service: FakeGameService(), onHosted: { _, _, _ in }, onJoin: { _ in },
                            resume: ResumePrompt(code: "HX7KQ", error: "Something went wrong"), name: "Stephen", code: ""), height: 940)
    }

    func testJoinName() {
        let vm = JoinViewModel(service: FakeGameService(), code: "HX7KQ", phase: .name)
        assertBoth(JoinView(model: vm, onHome: {}, name: "Cody"), height: 400)
    }

    func testJoinWaiting() {
        let vm = JoinViewModel(service: FakeGameService(), code: "HX7KQ", phase: .waiting(gameId: "g1", reclaimId: "r1"))
        assertBoth(JoinView(model: vm, onHome: {}, name: "Cody", animateWaiting: false), height: 400)
    }

    func testJoinDenied() {
        let vm = JoinViewModel(service: FakeGameService(), code: "HX7KQ", phase: .name, denied: true)
        assertBoth(JoinView(model: vm, onHome: {}, name: "Cody"), height: 420)
    }

    func testJoinFailed() {
        let vm = JoinViewModel(service: FakeGameService(), code: "HX7KQ", phase: .failed(message: "No game with that code"))
        assertBoth(JoinView(model: vm, onHome: {}), height: 260)
    }

    func testKit() {
        assertBoth(KitGallery(), height: 820)
    }

    /// Lobby frames are full iPhone 17 screens so the sheet sits pinned at the bottom.
    private let screen: CGFloat = 852

    func testLobbyHost() {
        assertBoth(LobbyView(service: FakeGameService(), snapshot: F.lobby(mySeatId: "s1"), gameId: "g1", playersOpen: true), height: screen, drawHierarchy: true)
    }

    func testLobbyGuest() {
        assertBoth(LobbyView(service: FakeGameService(), snapshot: F.lobby(mySeatId: "s2"), gameId: "g1"), height: screen, drawHierarchy: true)
    }

    func testLobbyHostEmpty() {
        assertBoth(LobbyView(service: FakeGameService(), snapshot: F.lobbyEmpty(), gameId: "g1", animateWaiting: false), height: screen)
    }

    func testLobbyHostFilling() {
        assertBoth(LobbyView(service: FakeGameService(), snapshot: F.lobbyFilling(), gameId: "g1", playersOpen: true), height: screen, drawHierarchy: true)
    }

    func testLobbyHostReady() {
        assertBoth(LobbyView(service: FakeGameService(), snapshot: F.lobbyReady(), gameId: "g1"), height: screen, drawHierarchy: true)
    }

    /// The QR tile's share sheet at its medium detent.
    func testLobbyShareSheet() {
        assertBoth(ShareSheetView(code: "HX7KQ", onDone: {}), height: 420)
    }

    func testPlayWithLineAndBanner() {
        assertBoth(PlayView(service: FakeGameService(), snapshot: F.playing(), gameId: "g1", banner: F.bingos[2]), height: 470)
    }

    func testPlayGuestWithError() {
        var snap = F.playing(mySeatId: "s2")
        snap.board = F.board(lines: [], extraMarks: [0, 6, 18])
        assertBoth(PlayView(service: FakeGameService(), snapshot: snap, gameId: "g1", toggleError: "That square is not available"), height: 500)
    }

    func testLeaderboard() {
        assertBoth(RisoSheet(title: "Leaderboard", onClose: {}) { LeaderboardView(bingos: F.bingos, timeZone: F.utc) }, height: 380)
    }

    func testLeaderboardEmpty() {
        assertBoth(RisoSheet(title: "Leaderboard", onClose: {}) { LeaderboardView(bingos: []) }, height: 160)
    }

    func testEnded() {
        assertBoth(EndedView(service: FakeGameService(), snapshot: F.ended(), gameId: "g1", timeZone: F.utc), height: 760)
    }

    func testReclaimPrompt() {
        assertBoth(RisoPage { ReclaimPromptView(service: FakeGameService(), gameId: "g1", reclaims: F.reclaims) }, height: 220)
    }

    func testHostMenuSheet() {
        assertBoth(HostMenuSheet(service: FakeGameService(), gameId: "g1", snapshot: F.lobby(mySeatId: "s1"), onClose: {}), height: 340)
    }

    func testHostMenuConfirm() {
        assertBoth(HostMenuSheet(service: FakeGameService(), gameId: "g1", snapshot: F.lobby(mySeatId: "s1"), onClose: {}, target: F.seats[1]), height: 260)
    }

    func testListenerError() {
        let denied = AppError(code: "permission-denied", token: nil, underlying: nil)
        assertBoth(GameErrorView(message: ErrorMessages.listenerMessage(for: denied, wasSeated: true), onHome: {}), height: 160)
    }
}

/// The I2 kit on one page: brand mark (both sizes), wordmark, Host badge, mini-board art,
/// and a 6-seat avatar stack collapsed and expanded.
private struct KitGallery: View {
    private var sixSeats: [Seat] {
        SnapshotFixtures.seats + [
            Seat(seatId: "s5", doc: SeatDoc(name: "Ola", nameKey: "ola", joinedAt: SnapshotFixtures.fixedNow + 4000)),
            Seat(seatId: "s6", doc: SeatDoc(name: "Zed", nameKey: "zed", joinedAt: SnapshotFixtures.fixedNow + 5000)),
        ]
    }

    var body: some View {
        RisoPage(gutter: Riso.gutter, spacing: 24) {
            HStack(alignment: .bottom, spacing: 24) {
                PlayBrandMark(size: .header)
                PlayBrandMark(size: .home)
            }
            Wordmark().padding(.top, 22).frame(maxWidth: .infinity)
            HStack(spacing: 24) {
                RisoBadge("Host", kind: .expiring)
                RisoMiniBoardArt()
            }
            SectionLabel("Players")
            AvatarStack(seats: sixSeats, expanded: false, onToggle: {})
            AvatarStack(seats: sixSeats, max: 5, expanded: true, onToggle: {})
            HStack(spacing: 10) {
                RisoButton(title: "Host a game", kind: .primary) {}
                RisoButton(title: "Join", kind: .blue) {}
            }
            // Capsule controls (edge-stub check).
            HStack(spacing: 10) {
                RisoChip(title: "All", isOn: true) {}
                RisoChip(title: "Mine") {}
                RisoToolbarPill(title: "Done") {}
            }
            WaitingPill(title: "Waiting for players", style: .compact, animated: false)
            HStack(spacing: 10) {
                RisoSegmented(options: [(0, "Pool"), (1, "Players")], selection: .constant(0), style: .pill)
                RisoSegmented(options: [(0, "One"), (1, "Split")], selection: .constant(1), style: .pill, size: .compact)
            }
        }
    }
}
