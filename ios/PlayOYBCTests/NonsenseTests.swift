import XCTest
@testable import PlayOYBC

/// Mirrors `web/src/pages/lobby/nonsense.test.ts`, plus vectors pinned from the web
/// implementation so both platforms draw the same hidden-row lengths.
final class NonsenseTests: XCTestCase {
    func testStablePerTaskId() {
        XCTAssertEqual(Nonsense.forTask("t2"), Nonsense.forTask("t2"))
        XCTAssertEqual(Nonsense.forTask("abc123"), Nonsense.forTask("abc123"))
    }

    func testStaysWithinLengthBoundsForManyIds() throws {
        let shape = try NSRegularExpression(pattern: "^[a-z]+( [a-z]+)*$")
        for i in 0..<500 {
            let s = Nonsense.forTask("task-\(i)")
            XCTAssertGreaterThanOrEqual(s.count, Nonsense.minLength)
            XCTAssertLessThanOrEqual(s.count, Nonsense.maxLength)
            XCTAssertNotNil(shape.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)), s)
        }
    }

    func testVariesLengthAcrossIds() {
        let lengths = Set((0..<100).map { Nonsense.forTask("id\($0)").count })
        XCTAssertGreaterThan(lengths.count, 10)
    }

    func testDiffersBetweenIds() {
        XCTAssertNotEqual(Nonsense.forTask("a"), Nonsense.forTask("b"))
    }

    /// Outputs of web `nonsenseFor` for the same ids (UTF-16 hashing included).
    func testMatchesWebVectors() {
        let vectors: [(String, String)] = [
            ("t2", "dor lofe sa um mium"),
            ("abc123", "no dorosdor keblino qua fepri l"),
            ("a", "bli stirasa tha dorqua nolovel rathasti no ra t"),
            ("b", "loumra ra pri bli nyelo quanyer"),
            ("task-0", "raprino bli qua wo zen quasazen kewosti turfebli"),
            ("7f3c9e2a-1b4d-4c8e-9a6f-2d5e8b1c0f37", "umtha dorzen nye oswo bliwoke blife rador quatha do"),
            ("é✓", "thawo ke nyetha umno ranye velk"),
        ]
        for (id, expected) in vectors { XCTAssertEqual(Nonsense.forTask(id), expected, id) }
    }
}
