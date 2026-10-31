import Foundation

/// The bind sheet's calls for one roster name: `bindName` per row tap and `retireName` from the
/// "Not coming?" confirm, each gated so a second tap while one is in flight does nothing. Never
/// optimistic: the selection is whatever the next state frame's roster says.
@MainActor
final class NameBindingModel: ObservableObject {
    /// A `bindName` call is in flight (the rows are disabled).
    @Published private(set) var busy = false
    /// Copy for the last failed `bindName`.
    @Published private(set) var error: String?
    /// A `retireName` call is in flight.
    @Published private(set) var retiring = false
    /// Copy for the last failed `retireName`.
    @Published private(set) var retireError: String?

    let key: String
    private let service: GameService
    private let gameId: String

    init(service: GameService, gameId: String, key: String) {
        self.service = service
        self.gameId = gameId
        self.key = key
    }

    /// Binds the name to `seatId` (nil = nobody yet). Does nothing while a call is in flight or when
    /// `seatId` is already the binding.
    /// - Parameters:
    ///   - seatId: the seat to bind, or nil to unbind.
    ///   - current: the binding the latest roster shows.
    func bind(_ seatId: String?, current: String?) async {
        guard !busy, !retiring, seatId != current else { return }
        busy = true
        error = nil
        do { try await service.bindName(gameId: gameId, key: key, seatId: seatId) }
        catch { self.error = ErrorMessages.message(for: error) }
        busy = false
    }

    /// Retires the name.
    /// - Returns: true when the server took it (the caller closes the sheet).
    @discardableResult
    func retire() async -> Bool {
        guard !retiring, !busy else { return false }
        retiring = true
        retireError = nil
        defer { retiring = false }
        do {
            try await service.retireName(gameId: gameId, key: key)
            return true
        } catch {
            retireError = ErrorMessages.message(for: error)
            return false
        }
    }

    /// Clears a stale retire error when the confirm reopens.
    func clearRetireError() { retireError = nil }
}
