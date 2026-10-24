import XCTest
@testable import PlayOYBC

/// The host-only reclaims listener failing must not end the game stream; every other listener's error does.
@MainActor
final class SubscriptionHubTests: XCTestCase {
    private let hostGame = GameDoc(code: "ABCDE", stage: .playing, hostSeatId: "s1", createdAt: 1, launchedAt: 2, endedAt: nil,
                                   bingoCount: 0, shortfalls: [:], reviewGate: false)
    private let reclaim = Reclaim(id: "r1", doc: ReclaimDoc(requesterUid: "u9", name: "Cody", seatId: "s2", status: .pending, createdAt: 1))

    private func makeHub() -> (SubscriptionHub, AsyncThrowingStream<GameSnapshot, Error>.Iterator) {
        let (stream, continuation) = AsyncThrowingStream<GameSnapshot, Error>.makeStream()
        let hub = SubscriptionHub(db: nil, gameId: "g1", seatId: "s1", continuation: continuation)
        hub.seedForTesting(seats: [], view: [], board: nil, bingos: [])
        return (hub, stream.makeAsyncIterator())
    }

    func testReclaimsErrorClearsPromptsAndKeepsStreaming() async throws {
        let (hub, iterator) = makeHub(); var it = iterator
        hub.gameChanged(hostGame)
        hub.reclaimsChanged([reclaim])
        _ = try await it.next()
        let withPrompt = try await it.next()
        XCTAssertEqual(withPrompt?.reclaims, [reclaim])

        hub.reclaimsFailed(AppError(code: "permission-denied", token: nil, underlying: nil))
        let afterError = try await it.next()
        XCTAssertEqual(afterError?.reclaims, [])

        var g = hostGame
        g.bingoCount = 1
        hub.gameChanged(g)
        let later = try await it.next()
        XCTAssertEqual(later?.game.bingoCount, 1, "stream still live after the reclaims error")
    }

    func testOtherListenerErrorEndsTheStream() async throws {
        let (hub, iterator) = makeHub(); var it = iterator
        hub.gameChanged(hostGame)
        _ = try await it.next()
        hub.listenerFailedForTesting(AppError(code: "unavailable", token: nil, underlying: nil))
        do {
            _ = try await it.next()
            XCTFail("expected the stream to throw")
        } catch {}
    }
}
