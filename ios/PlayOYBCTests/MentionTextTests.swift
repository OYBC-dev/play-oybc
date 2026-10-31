import SwiftUI
import XCTest
@testable import PlayOYBC

final class MentionTextTests: XCTestCase {
    private let plain = Font.risoBody(10, .semibold)
    private let bold = Font.risoBody(10, .extraBold)

    /// The substrings drawn in the bold font, in order.
    private func boldRuns(_ text: String, _ refs: [[Int]]) -> [String] {
        let a = MentionText.attributed(text, refs: refs, font: plain, boldFont: bold)
        return a.runs.compactMap { run in run.font == bold ? String(a[run.range].characters) : nil }
    }

    func testRangeAtStartMiddleAndEnd() {
        XCTAssertEqual(boldRuns("Cody does X", [[0, 4]]), ["Cody"])
        XCTAssertEqual(boldRuns("Then Cody sings", [[5, 9]]), ["Cody"])
        XCTAssertEqual(boldRuns("A song by Cody", [[10, 14]]), ["Cody"])
    }

    func testTwoRanges() {
        XCTAssertEqual(boldRuns("Cody hugs Mary Jane", [[0, 4], [10, 19]]), ["Cody", "Mary Jane"])
    }

    func testEmojiBeforeARangeCountsInUTF16() {
        // 🎃 is two UTF-16 units.
        XCTAssertEqual(boldRuns("🎃 Cody carves", [[3, 7]]), ["Cody"])
    }

    func testMalformedAndOutOfRangePairsAreIgnored() {
        XCTAssertEqual(boldRuns("Cody", [[0, 99]]), [])
        XCTAssertEqual(boldRuns("Cody", [[3, 1], [2], [-1, 2]]), [])
        XCTAssertEqual(boldRuns("Cody does X", [[0, 4], [40, 50]]), ["Cody"])
    }

    func testNoRefsIsPlainTextInTheBaseFont() {
        let a = MentionText.attributed("Sing", refs: [], font: plain, boldFont: bold)
        XCTAssertEqual(String(a.characters), "Sing")
        XCTAssertEqual(a.runs.count, 1)
        XCTAssertEqual(a.runs.first?.font, plain)
    }
}
