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
    private func assertBoth<V: View>(_ view: V, height: CGFloat, file: StaticString = #filePath, testName: String = #function, line: UInt = #line) {
        for (name, style, scheme) in [("light", UIUserInterfaceStyle.light, ColorScheme.light), ("dark", .dark, .dark)] {
            let v = view.environment(\.colorScheme, scheme)
            assertSnapshot(of: v, as: .image(layout: .fixed(width: 393, height: height), traits: UITraitCollection(userInterfaceStyle: style)),
                           named: name, record: recordMode, file: file, testName: testName, line: line)
        }
    }

    func testHome() {
        assertBoth(HomeView(service: FakeGameService(), onHosted: { _, _, _ in }, onJoin: { _ in }, name: "Stephen", code: "HX7KQ"), height: 520)
    }

    func testJoinName() {
        let vm = JoinViewModel(service: FakeGameService(), code: "HX7KQ", phase: .name)
        assertBoth(JoinView(model: vm, onHome: {}, name: "Cody"), height: 360)
    }

    func testLobbyHost() {
        assertBoth(LobbyView(service: FakeGameService(), snapshot: F.lobby(mySeatId: "s1"), gameId: "g1"), height: 1360)
    }

    func testLobbyGuest() {
        assertBoth(LobbyView(service: FakeGameService(), snapshot: F.lobby(mySeatId: "s2"), gameId: "g1"), height: 760)
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
