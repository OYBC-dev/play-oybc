import XCTest
@testable import PlayOYBC

/// A FIFO an async consumer can wait on, with a timeout so a broken expectation fails instead of hanging.
final class AsyncQueue<T>: @unchecked Sendable {
    struct Timeout: Error {}
    private let lock = NSLock()
    private var items: [Result<T, Error>] = []
    private var waiter: (id: Int, cont: CheckedContinuation<T, Error>)?
    private var nextWaiter = 0

    func put(_ item: Result<T, Error>) {
        lock.lock()
        if let w = waiter {
            waiter = nil
            lock.unlock()
            w.cont.resume(with: item)
        } else {
            items.append(item)
            lock.unlock()
        }
    }

    func take(timeout: Double = 3) async throws -> T {
        try await withCheckedThrowingContinuation { cont in
            lock.lock()
            if !items.isEmpty {
                let item = items.removeFirst()
                lock.unlock()
                cont.resume(with: item)
                return
            }
            nextWaiter += 1
            let id = nextWaiter
            waiter = (id, cont)
            lock.unlock()
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
                guard let self else { return }
                self.lock.lock()
                guard let w = self.waiter, w.id == id else { self.lock.unlock(); return }
                self.waiter = nil
                self.lock.unlock()
                w.cont.resume(throwing: Timeout())
            }
        }
    }
}

/// An in-memory socket: the test pushes server frames and reads what the room sent.
final class FakeTransport: Transport, @unchecked Sendable {
    let url: URL
    private let inbox = AsyncQueue<String>()
    private let outbox = AsyncQueue<String>()
    private let lock = NSLock()
    private var _cancelled = false
    var cancelled: Bool { lock.withLock { _cancelled } }

    init(url: URL) { self.url = url }

    func send(_ text: String) async throws { outbox.put(.success(text)) }
    func receive() async throws -> String { try await inbox.take(timeout: 3600) }
    func cancel() {
        lock.withLock { _cancelled = true }
        inbox.put(.failure(TransportClosed(code: 1006)))
    }

    /// Delivers a server frame.
    func push(_ text: String) { inbox.put(.success(text)) }
    /// The server closes the socket with `code` (and `reason`).
    func close(code: Int, reason: String? = nil) { inbox.put(.failure(TransportClosed(code: code, reason: reason))) }
    /// The next frame the room sent, as JSON.
    func nextSent() async throws -> [String: Any] {
        let text = try await outbox.take()
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any], "not JSON: \(text)")
    }
}

/// Hands out a fresh `FakeTransport` per connection attempt and lets the test wait for each one.
final class Dialer: @unchecked Sendable {
    let made = AsyncQueue<FakeTransport>()
    func make(_ url: URL) -> Transport {
        let t = FakeTransport(url: url)
        made.put(.success(t))
        return t
    }
}

/// A clock the test moves by hand, and a counter of token fetches.
final class ManualClock: @unchecked Sendable {
    private let lock = NSLock()
    private var t = 0.0
    private var fetches = 0
    var now: Double { lock.withLock { t } }
    func advance(_ s: Double) { lock.withLock { t += s } }
    /// Counts one token fetch and returns how many came before it.
    func nextFetch() -> Int { lock.withLock { defer { fetches += 1 }; return fetches } }
}

final class RoomConnectionTests: XCTestCase {
    private let game = #"{"code":"ABCDE","stage":"playing","hostSeatId":"s1","createdAt":1,"bingoCount":0,"shortfalls":{},"reviewGate":false}"#

    private func makeRoom(startSuspended: Bool = false) -> (RoomConnection, Dialer) {
        let dialer = Dialer()
        let room = RoomConnection(url: URL(string: "ws://test.local")!, code: "ABCDE", tokenProvider: { "tok" },
                                  makeTransport: { dialer.make($0) }, random: { 0.5 }, startSuspended: startSuspended)
        return (room, dialer)
    }

    private func welcome(seat: String?, gameId: String = "g1", rev: Int = 1) -> String {
        let s = seat.map { "\"\($0)\"" } ?? "null"
        return #"{"t":"welcome","uid":"u1","gameId":"\#(gameId)","seatId":\#(s),"stage":"playing","rev":\#(rev)}"#
    }

    private func fullState(rev: Int, view: String = "Sing") -> String {
        #"""
        {"t":"state","rev":\#(rev),"game":\#(game),"seats":[{"seatId":"s1","name":"Ann","nameKey":"ann","joinedAt":1}],
         "view":[{"taskId":"t1","authorName":"Ann","text":"\#(view)","mine":true}],"board":null,"bingos":[],"reclaims":[]}
        """#
    }

    /// Drains a stream into a queue the test can wait on.
    private func collect<T>(_ stream: AsyncStream<T>) -> AsyncQueue<T> {
        let q = AsyncQueue<T>()
        _Concurrency.Task { for await v in stream { q.put(.success(v)) } }
        return q
    }

    func testHelloWelcomeThenOneSnapshot() async throws {
        let (room, dialer) = makeRoom()
        let snaps = collect(await room.snapshots())
        let t = try await dialer.made.take()
        XCTAssertEqual(t.url.absoluteString, "ws://test.local/ws/ABCDE")
        let hello = try await t.nextSent()
        XCTAssertEqual(hello["t"] as? String, "hello")
        XCTAssertEqual(hello["token"] as? String, "tok")
        XCTAssertNil(hello["gameId"])

        t.push(welcome(seat: "s1"))
        t.push(fullState(rev: 1))
        let s = try await snaps.take()
        XCTAssertEqual(s.mySeatId, "s1")
        XCTAssertEqual(s.game.code, "ABCDE")
        XCTAssertEqual(s.seats.map(\.seatId), ["s1"])
        XCTAssertNil(s.board)
        XCTAssertEqual(s.reclaims, [])
        XCTAssertEqual(s.standings, [], "a frame without standings still completes the snapshot")
    }

    func testRosterSectionReplacesWholesaleAndAbsentKeeps() async throws {
        let (room, dialer) = makeRoom()
        let snaps = collect(await room.snapshots())
        let t = try await dialer.made.take()
        _ = try await t.nextSent()
        t.push(welcome(seat: "s1"))
        t.push(fullState(rev: 1))
        let first = try await snaps.take()
        XCTAssertEqual(first.roster, [], "no roster section yet → empty")
        t.push(#"{"t":"state","rev":2,"roster":[{"key":"jess","display":"Jess","seatId":null},{"key":"jo","display":"Jo","seatId":"s1"}]}"#)
        let second = try await snaps.take()
        XCTAssertEqual(second.roster.map(\.key), ["jess", "jo"])
        t.push(#"{"t":"state","rev":3,"standings":[]}"#)
        let third = try await snaps.take()
        XCTAssertEqual(third.roster.map(\.key), ["jess", "jo"], "a frame without roster keeps it")
        t.push(#"{"t":"state","rev":4,"roster":[{"key":"jo","display":"Jo","seatId":null}]}"#)
        let fourth = try await snaps.take()
        XCTAssertEqual(fourth.roster, [RosterName(key: "jo", display: "Jo", seatId: nil)])
    }

    func testStandingsSectionMergesIntoTheSnapshot() async throws {
        let (room, dialer) = makeRoom()
        let snaps = collect(await room.snapshots())
        let t = try await dialer.made.take()
        _ = try await t.nextSent()
        t.push(welcome(seat: "s1"))
        t.push(fullState(rev: 1))
        _ = try await snaps.take()
        t.push(#"{"t":"state","rev":2,"standings":[{"seatId":"s1","name":"Ann","bingos":1,"marked":6,"bestLine":3,"firstBingoSeq":1}]}"#)
        let next = try await snaps.take()
        XCTAssertEqual(next.standings, [Standing(seatId: "s1", name: "Ann", bingos: 1, marked: 6, bestLine: 3, firstBingoSeq: 1)])
        XCTAssertEqual(next.view.first?.text, "Sing")
    }

    func testAckResolvesWithDecodedResult() async throws {
        let (room, dialer) = makeRoom()
        let act = _Concurrency.Task { () async throws -> ToggleMarkRes in try await room.act("mark", ["cellIndex": 3, "marked": true]) }
        let t = try await dialer.made.take()
        _ = try await t.nextSent()
        t.push(welcome(seat: "s1"))
        let sent = try await t.nextSent()
        XCTAssertEqual(sent["t"] as? String, "act")
        XCTAssertEqual(sent["op"] as? String, "mark")
        XCTAssertEqual((sent["args"] as? [String: Any])?["cellIndex"] as? Int, 3)
        let id = try XCTUnwrap(sent["id"] as? String)
        t.push(#"{"t":"ack","id":"\#(id)","ok":true,"result":{"marks":[true],"completedLines":[],"newBingoSeqs":[]}}"#)
        let res = try await act.value
        XCTAssertEqual(res, ToggleMarkRes(marks: [true], completedLines: [], newBingoSeqs: []))
    }

    func testInFlightActRejectsOfflineOnClose() async throws {
        let (room, dialer) = makeRoom()
        let act = _Concurrency.Task { () async throws -> ToggleMarkRes in try await room.act("mark", ["cellIndex": 3, "marked": true]) }
        let t = try await dialer.made.take()
        _ = try await t.nextSent()
        t.push(welcome(seat: "s1"))
        let actFrame = try await t.nextSent()
        XCTAssertEqual(actFrame["t"] as? String, "act")
        t.close(code: 1006)
        do {
            _ = try await act.value
            XCTFail("an unacked act must fail when the socket closes")
        } catch {
            XCTAssertEqual(AppError.from(error).code, "offline")
        }
    }

    func testQueuedActSurvivesReconnect() async throws {
        let (room, dialer) = makeRoom()
        let act = _Concurrency.Task { () async throws -> ToggleMarkRes in try await room.act("mark", ["cellIndex": 1, "marked": false]) }
        let t1 = try await dialer.made.take()
        _ = try await t1.nextSent()
        t1.close(code: 1006) // before any welcome: the act was never sent
        let t2 = try await dialer.made.take()
        let helloFrame = try await t2.nextSent()
        XCTAssertEqual(helloFrame["t"] as? String, "hello")
        t2.push(welcome(seat: "s1"))
        let sent = try await t2.nextSent()
        XCTAssertEqual(sent["op"] as? String, "mark")
        t2.push(#"{"t":"ack","id":"\#(sent["id"] as? String ?? "")","ok":false,"code":"wrong-stage"}"#)
        do {
            _ = try await act.value
            XCTFail("a failed ack must reject")
        } catch {
            XCTAssertEqual(AppError.from(error).code, "wrong-stage")
        }
    }

    func testOlderRevIsIgnored() async throws {
        let (room, dialer) = makeRoom()
        let snaps = collect(await room.snapshots())
        let t = try await dialer.made.take()
        _ = try await t.nextSent()
        t.push(welcome(seat: "s1", rev: 5))
        t.push(fullState(rev: 5))
        let firstSnap = try await snaps.take()
        XCTAssertEqual(firstSnap.view.first?.text, "Sing")
        t.push(#"{"t":"state","rev":4,"view":[{"taskId":"t1","authorName":"Ann","text":"Stale","mine":true}]}"#)
        t.push(#"{"t":"state","rev":6,"bingos":[{"seq":1,"seatId":"s1","name":"Ann","line":"row_0","playerBingoNumber":1,"at":2,"status":"announced"}]}"#)
        let next = try await snaps.take()
        XCTAssertEqual(next.bingos.count, 1)
        XCTAssertEqual(next.view.first?.text, "Sing")
    }

    func testSuspendThenResumeReconnectsAndReHellosWithGameId() async throws {
        let (room, dialer) = makeRoom()
        let snaps = collect(await room.snapshots())
        let t1 = try await dialer.made.take()
        _ = try await t1.nextSent()
        t1.push(welcome(seat: "s1", rev: 2))
        t1.push(fullState(rev: 2))
        let first = try await snaps.take()

        await room.suspend()
        XCTAssertTrue(t1.cancelled)
        await room.resume()
        let t2 = try await dialer.made.take()
        let hello = try await t2.nextSent()
        XCTAssertEqual(hello["t"] as? String, "hello")
        XCTAssertEqual(hello["gameId"] as? String, "g1")
        // `welcome` resets the applied rev, so the same rev applies again and the full state is re-emitted.
        t2.push(welcome(seat: "s1", rev: 2))
        t2.push(fullState(rev: 2))
        let reEmitted = try await snaps.take()
        XCTAssertEqual(reEmitted, first)
    }

    func testEvictionCloseIsFatalPermissionDenied() async throws {
        let (room, dialer) = makeRoom()
        let fatal = collect(await room.fatal())
        let snaps = await room.snapshots() // held, so the room has a listener
        let t = try await dialer.made.take()
        _ = try await t.nextSent()
        t.push(welcome(seat: "s1"))
        t.close(code: 4003)
        let evicted = try await fatal.take()
        XCTAssertEqual(evicted, AppError(code: "permission-denied", token: nil, underlying: nil))
        withExtendedLifetime(snaps) {}
    }

    func testSeatLostAcrossReconnectIsFatal() async throws {
        let (room, dialer) = makeRoom()
        let fatal = collect(await room.fatal())
        let snaps = await room.snapshots() // held, so the room reconnects
        let t1 = try await dialer.made.take()
        _ = try await t1.nextSent()
        t1.push(welcome(seat: "s1"))
        t1.close(code: 1006)
        let t2 = try await dialer.made.take()
        _ = try await t2.nextSent()
        t2.push(welcome(seat: nil))
        let seatLost = try await fatal.take()
        XCTAssertEqual(seatLost.code, "permission-denied")
        withExtendedLifetime(snaps) {}
    }

    func testSeatGrantedAcrossReconnectApprovesWatchedReclaim() async throws {
        let (room, dialer) = makeRoom()
        let statuses = collect(await room.reclaimStatus(id: "r1"))
        let t1 = try await dialer.made.take()
        _ = try await t1.nextSent()
        t1.push(welcome(seat: nil))
        t1.push(#"{"t":"reclaim","id":"r1","status":"pending"}"#)
        let pending = try await statuses.take()
        XCTAssertEqual(pending, .pending)
        t1.close(code: 1006)
        let t2 = try await dialer.made.take()
        _ = try await t2.nextSent()
        t2.push(welcome(seat: "s9"))
        let approved = try await statuses.take()
        XCTAssertEqual(approved, .approved)
    }

    func testStartSuspendedDoesNotConnectUntilResume() async throws {
        let (room, dialer) = makeRoom(startSuspended: true)
        let snaps = collect(await room.snapshots())
        do {
            _ = try await dialer.made.take(timeout: 0.5)
            XCTFail("a room born suspended must not connect")
        } catch is AsyncQueue<FakeTransport>.Timeout {}
        await room.resume()
        let t = try await dialer.made.take()
        let hello = try await t.nextSent()
        XCTAssertEqual(hello["t"] as? String, "hello")
        t.push(welcome(seat: "s1"))
        t.push(fullState(rev: 1))
        let snap = try await snaps.take()
        XCTAssertEqual(snap.mySeatId, "s1")
    }

    func testSupersededCloseParksUntilTheNextAct() async throws {
        let (room, dialer) = makeRoom()
        let fatal = collect(await room.fatal())
        let snaps = await room.snapshots() // held, so a plain close would reconnect
        let t1 = try await dialer.made.take()
        _ = try await t1.nextSent()
        t1.push(welcome(seat: "s1"))
        t1.close(code: 1000, reason: "superseded")
        do {
            _ = try await dialer.made.take(timeout: 1.5)
            XCTFail("a superseded room must not reconnect by itself")
        } catch is AsyncQueue<FakeTransport>.Timeout {}
        do {
            _ = try await fatal.take(timeout: 0.1)
            XCTFail("superseded is not fatal")
        } catch is AsyncQueue<AppError>.Timeout {}
        let act = _Concurrency.Task { () async throws -> ToggleMarkRes in try await room.act("mark", ["cellIndex": 2, "marked": true]) }
        let t2 = try await dialer.made.take()
        _ = try await t2.nextSent()
        t2.push(welcome(seat: "s1"))
        let sent = try await t2.nextSent()
        t2.push(#"{"t":"ack","id":"\#(sent["id"] as? String ?? "")","ok":true,"result":{"marks":[],"completedLines":[],"newBingoSeqs":[]}}"#)
        _ = try await act.value
        withExtendedLifetime(snaps) {}
    }

    func testNoWelcomeBeforeTheConnectDeadlineAbandonsAndReconnects() async throws {
        let dialer = Dialer()
        let room = RoomConnection(url: URL(string: "ws://test.local")!, code: "ABCDE", tokenProvider: { "tok" },
                                  makeTransport: { dialer.make($0) }, random: { 0.5 }, connectDeadline: 0.3)
        let snaps = collect(await room.snapshots())
        let t1 = try await dialer.made.take()
        _ = try await t1.nextSent() // hello, never answered
        let act = _Concurrency.Task { () async throws -> ToggleMarkRes in try await room.act("mark", ["cellIndex": 4, "marked": true]) }
        let t2 = try await dialer.made.take()
        XCTAssertTrue(t1.cancelled)
        let hello = try await t2.nextSent()
        XCTAssertEqual(hello["t"] as? String, "hello")
        t2.push(welcome(seat: "s1"))
        // The act queued during the stalled handshake goes out on the new socket.
        let sent = try await t2.nextSent()
        XCTAssertEqual(sent["op"] as? String, "mark")
        t2.push(#"{"t":"ack","id":"\#(sent["id"] as? String ?? "")","ok":true,"result":{"marks":[],"completedLines":[],"newBingoSeqs":[]}}"#)
        _ = try await act.value
        t2.push(fullState(rev: 1))
        let snap = try await snaps.take()
        XCTAssertEqual(snap.mySeatId, "s1")
        // A welcomed socket outlives the deadline.
        do {
            _ = try await dialer.made.take(timeout: 1)
            XCTFail("a welcomed socket must not be abandoned")
        } catch is AsyncQueue<FakeTransport>.Timeout {}
        XCTAssertFalse(t2.cancelled)
    }

    func testAHangingTokenFetchHitsTheConnectDeadline() async throws {
        let dialer = Dialer()
        let clock = ManualClock()
        let room = RoomConnection(url: URL(string: "ws://test.local")!, code: "ABCDE",
                                  tokenProvider: {
                                      if clock.nextFetch() == 0 { try? await _Concurrency.Task.sleep(nanoseconds: 3_600_000_000_000) }
                                      return "tok"
                                  },
                                  makeTransport: { dialer.make($0) }, random: { 0.5 }, connectDeadline: 0.3)
        let hello = _Concurrency.Task { try await room.hello(gameId: "g1") }
        let t1 = try await dialer.made.take()
        let t2 = try await dialer.made.take()
        XCTAssertTrue(t1.cancelled)
        let frame = try await t2.nextSent()
        XCTAssertEqual(frame["gameId"] as? String, "g1")
        t2.push(welcome(seat: "s1"))
        let w = try await hello.value
        XCTAssertEqual(w.seatId, "s1")
    }

    func testWakeDuringAStalledConnectAbandonsIt() async throws {
        let dialer = Dialer()
        let clock = ManualClock()
        let room = RoomConnection(url: URL(string: "ws://test.local")!, code: "ABCDE", tokenProvider: { "tok" },
                                  makeTransport: { dialer.make($0) }, random: { 0.5 }, now: { clock.now })
        let snaps = collect(await room.snapshots())
        let t1 = try await dialer.made.take()
        _ = try await t1.nextSent()
        // A wake right after the socket opened leaves the handshake alone.
        clock.advance(1)
        await room.wake()
        XCTAssertFalse(t1.cancelled)
        clock.advance(2)
        await room.wake()
        XCTAssertTrue(t1.cancelled)
        // ...and reconnects at once, without the backoff wait.
        let t2 = try await dialer.made.take(timeout: 0.2)
        _ = try await t2.nextSent()
        t2.push(welcome(seat: "s1"))
        t2.push(fullState(rev: 1))
        let snap = try await snaps.take()
        XCTAssertEqual(snap.mySeatId, "s1")
        // A ready socket is never dropped by the stall check.
        clock.advance(10)
        await room.wake()
        XCTAssertFalse(t2.cancelled)
    }

    func testTryAgainThenClose1013ReconnectsAndTheWaitingHelloResolves() async throws {
        let (room, dialer) = makeRoom()
        let hello = _Concurrency.Task { try await room.hello(gameId: "g1") }
        let t1 = try await dialer.made.take()
        _ = try await t1.nextSent()
        t1.push(#"{"t":"error","code":"try-again"}"#)
        t1.close(code: 1013, reason: "try-again")
        let t2 = try await dialer.made.take()
        let again = try await t2.nextSent()
        XCTAssertEqual(again["gameId"] as? String, "g1")
        t2.push(welcome(seat: "s1"))
        let w = try await hello.value
        XCTAssertEqual(w.seatId, "s1")
    }
}

final class PendingTaskIdsTests: XCTestCase {
    func testARetryOfTheSameTextReusesItsIdUntilAcked() {
        var ids = PendingTaskIds()
        let first = ids.id(gameId: "g1", text: "Sing")
        XCTAssertEqual(ids.id(gameId: "g1", text: " Sing\n"), first)
        XCTAssertNotEqual(ids.id(gameId: "g1", text: "Dance"), first)
        XCTAssertNotEqual(ids.id(gameId: "g2", text: "Sing"), first)
        ids.confirm(gameId: "g1", text: "Sing")
        XCTAssertNotEqual(ids.id(gameId: "g1", text: "Sing"), first)
    }
}
