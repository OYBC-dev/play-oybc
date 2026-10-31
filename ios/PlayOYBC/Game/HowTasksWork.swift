import Foundation

/// The "How tasks work" explainer's two entry points and its copy (handoff v2 §5).
enum HowTasksWork {
    /// Persisted per device once the explainer is dismissed.
    static let seenKey = "oybc.howto.seen"

    enum Entry: Equatable {
        /// Opened automatically on this device's first lobby.
        case firstJoin(name: String)
        /// Opened from the composer's (i) bubble.
        case info
    }

    /// One task type: its pill, then "Seen by" / "Dealt to". `*Name*` parts render italic bold.
    struct Kind: Equatable, Identifiable {
        enum Tag: Equatable { case plain, name, someone, anyone }
        var tag: Tag
        var title: String
        var seen: [Part]
        var dealt: [Part]
        var id: String { title }
    }

    /// A run of copy; `emphasis` is the placeholder *Name*.
    struct Part: Equatable {
        var text: String
        var emphasis = false
    }

    static let kinds: [Kind] = [
        Kind(tag: .plain, title: "Plain", seen: [Part(text: "Everyone")], dealt: [Part(text: "Everyone")]),
        Kind(tag: .name, title: "@Name",
             seen: [Part(text: "Everyone except "), Part(text: "Name", emphasis: true)],
             dealt: [Part(text: "Everyone except "), Part(text: "Name", emphasis: true)]),
        Kind(tag: .someone, title: "@someone", seen: [Part(text: "Only you")], dealt: [Part(text: "A random player on each board")]),
        Kind(tag: .anyone, title: "@anyone", seen: [Part(text: "Only you")],
             dealt: [Part(text: "One board · counts when anyone but its owner does it")]),
    ]

    static func kicker(_ entry: Entry) -> String {
        if case let .firstJoin(name) = entry { return "Welcome, \(name)" }
        return "Pool"
    }

    static func button(_ entry: Entry) -> String {
        if case .firstJoin = entry { return "Got it, let's add some" }
        return "Done"
    }

    /// Whether the lobby opens the explainer on its own: lobby stage, never seen on this device, and
    /// this seat has authored nothing yet (a reconnect after adding tasks skips it).
    static func shouldAutoOpen(seen: Bool, stage: Stage, entries: [PoolViewEntry]) -> Bool {
        !seen && stage == .lobby && !entries.contains(where: \.mine)
    }

    static func hasSeen(_ defaults: UserDefaults) -> Bool { defaults.bool(forKey: seenKey) }

    static func markSeen(_ defaults: UserDefaults) { defaults.set(true, forKey: seenKey) }
}
