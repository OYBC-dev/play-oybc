import FirebaseAuth
import FirebaseCore
import Foundation

/// Single-flight anonymous sign-in: waits for Auth's first state callback before deciding.
actor AuthGate {
    private var inFlight: _Concurrency.Task<Void, Error>?

    func ensureSignedIn() async throws {
        if let inFlight { return try await inFlight.value }
        let t = _Concurrency.Task<Void, Error> {
            try await Self.restoreOrSignIn()
        }
        inFlight = t
        do { try await t.value } catch { inFlight = nil; throw error }
    }

    private static func restoreOrSignIn() async throws {
        let auth = Auth.auth()
        // The first listener callback reports the restored session (or nil).
        let existing: User? = await withCheckedContinuation { cont in
            var handle: AuthStateDidChangeListenerHandle?
            var done = false
            handle = auth.addStateDidChangeListener { _, user in
                guard !done else { return }
                done = true
                if let handle { auth.removeStateDidChangeListener(handle) }
                cont.resume(returning: user)
            }
        }
        if existing == nil { _ = try await auth.signInAnonymously() }
    }
}

/// The Firebase pieces the game server needs: the app configuration and an anonymous user's ID token.
final class FirebaseSession: @unchecked Sendable {
    static let shared = FirebaseSession()
    private let gate = AuthGate()

    /// Configures Firebase once (idempotent). `-useEmulators YES` points Auth at the local emulator.
    static func configure(useEmulators: Bool = UserDefaults.standard.bool(forKey: "useEmulators")) {
        guard FirebaseApp.app() == nil else { return }
        FirebaseApp.configure()
        if useEmulators { Auth.auth().useEmulator(withHost: "127.0.0.1", port: 9099) }
    }

    /// Anonymous sign-in; concurrent callers share one flight.
    func ensureSignedIn() async throws { try await gate.ensureSignedIn() }

    /// A current ID token for the signed-in (anonymous) user, signing in first when needed.
    /// - Throws: the sign-in or token-refresh failure; `AppError` `unauthenticated` when no user results.
    func idToken() async throws -> String {
        try await ensureSignedIn()
        guard let user = Auth.auth().currentUser else { throw AppError(code: "unauthenticated", token: nil, underlying: nil) }
        return try await user.getIDToken()
    }
}
