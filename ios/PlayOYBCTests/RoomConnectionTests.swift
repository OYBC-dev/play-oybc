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
    /// The server closes the socket with `code`.
    func close(code: Int) { inbox.put(.failure(TransportClosed(code: code))) }
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

final class RoomConnectionTests: XCTestCase {
    private let game = #"{"code":"ABCDE","stage":"playing","hostSeatId":"s1","createdAt":1,"bingoCount":0,"shortfalls":{},"reviewGate":false}"#

    private func makeRoom() -> (RoomConnection, Dialer) {
        let dialer = Dialer()
        let room = RoomConnection(url: URL(string: "ws://test.local")!, code: "ABCDE", tokenProvider: { "tok" },
                                  makeTransport: { dialer.make($0) }, random: { 0.5 })
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
}
