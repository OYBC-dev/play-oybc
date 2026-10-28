import FirebaseFirestore
import FirebaseFunctions
import XCTest
@testable import PlayOYBC

final class AppErrorTests: XCTestCase {
    func testDetailsCodeAndToken() {
        let ns = NSError(domain: FunctionsErrorDomain, code: FunctionsErrorCode.failedPrecondition.rawValue,
                         userInfo: [FunctionsErrorDetailsKey: ["code": "name-taken", "token": "tok"]])
        let e = AppError.from(ns)
        XCTAssertEqual(e.code, "name-taken")
        XCTAssertEqual(e.token, "tok")
        XCTAssertNotNil(e.underlying)
    }

    func testDetailsWithoutToken() {
        let ns = NSError(domain: FunctionsErrorDomain, code: 9, userInfo: [FunctionsErrorDetailsKey: ["code": "game-full"]])
        XCTAssertEqual(AppError.from(ns), AppError(code: "game-full", token: nil, underlying: nil))
    }

    func testFunctionsErrorWithoutDetailsFallsBackToCodeName() {
        let ns = NSError(domain: FunctionsErrorDomain, code: FunctionsErrorCode.unavailable.rawValue, userInfo: [:])
        XCTAssertEqual(AppError.from(ns).code, "functions/\(FunctionsErrorCode.unavailable.rawValue)")
    }

    func testOtherErrorsAreUnknownAndAppErrorPassesThrough() {
        XCTAssertEqual(AppError.from(NSError(domain: "x", code: 1)).code, "unknown")
        XCTAssertEqual(AppError.from(AppError.gameNotFound).code, "game-not-found")
    }

    func testFirestorePermissionDeniedMapsToPermissionDenied() {
        let ns = NSError(domain: FirestoreErrorDomain, code: FirestoreErrorCode.permissionDenied.rawValue)
        XCTAssertEqual(AppError.from(ns).code, "permission-denied")
        XCTAssertEqual(AppError.from(NSError(domain: FirestoreErrorDomain, code: FirestoreErrorCode.unavailable.rawValue)).code, "unknown")
    }

    func testCloseCodesMapToAppErrors() {
        XCTAssertEqual(AppError.fromClose(code: 4003).code, "permission-denied")
        XCTAssertEqual(AppError.fromClose(code: 4004).code, "game-not-found")
        XCTAssertEqual(AppError.fromClose(code: 4001).code, "unauthenticated")
        XCTAssertEqual(AppError.fromClose(code: 1006).code, "offline")
    }
}
