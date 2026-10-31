import Foundation

/// Game settings before the game exists (handoff v2 §1): the host's name from Home, an optional game
/// name, and Free space. `create()` calls `createGame` with them; a failure leaves the copy in `error`.
@MainActor
final class GameSettingsModel: ObservableObject {
    /// Longest game name the server takes (after trimming).
    static let maxGameName = 40

    let service: GameService
    /// The validated host name from Home (shown as "Hosting as {name}").
    @Published var hostName: String
    @Published var gameName = ""
    @Published var freeSpace = false
    @Published private(set) var busy = false
    @Published var error: String?

    init(service: GameService, hostName: String) {
        self.service = service
        self.hostName = hostName
    }

    /// 24 with Free space, else 25 (read-only, derived like the server's).
    var tasksPerBoard: Int { freeSpace ? 24 : 25 }

    /// The trimmed game name, or nil when blank.
    var trimmedGameName: String? {
        let t = gameName.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : String(t.prefix(Self.maxGameName))
    }

    /// Creates the game; nil (with `error` set) on failure or while a create is already in flight.
    func create() async -> CreateGameRes? {
        guard !busy else { return nil }
        busy = true
        error = nil
        do {
            let res = try await service.createGame(name: hostName, gameName: trimmedGameName, freeSpace: freeSpace)
            // Stays busy: the caller navigates away on success.
            return res
        } catch {
            self.error = ErrorMessages.message(for: error)
            busy = false
            return nil
        }
    }

    /// Home's "Host a game": validates the typed name, then reuses the settings already open (so Back and
    /// Host again keep the game name and Free space) or starts fresh.
    /// - Returns: the settings to show, or the validation copy for an invalid name.
    static func open(rawName: String, reusing existing: GameSettingsModel?, service: GameService) -> Result<GameSettingsModel, HostNameError> {
        guard let name = Mentions.normalizeName(rawName) else { return .failure(HostNameError()) }
        if let existing {
            existing.hostName = name
            existing.error = nil
            return .success(existing)
        }
        return .success(GameSettingsModel(service: service, hostName: name))
    }
}

/// Home's host name failed the name rules (1–20 letters, numbers, spaces, apostrophes, hyphens; not a keyword).
struct HostNameError: Error, Equatable {
    var message: String { ErrorMessages.message(for: AppError(code: "invalid-name", token: nil, underlying: nil)) }
}
