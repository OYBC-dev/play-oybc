import Foundation

/// The bind sheet's calls for one roster name: `bindName` per row tap and `retireName` from the
/// "Not coming" confirm, each gated so a second tap while one is in flight does nothing.
///
/// A tap shows at once: the tapped row stays the selection (`pending`) until a state frame's roster
/// carries that binding (`observe(current:)`), so the radio never flickers back to the old row
/// while the call and the frame cross. A failed call drops the pending pick.
@MainActor
final class NameBindingModel: ObservableObject {
    /// A pick the server has not confirmed yet; `seatId` nil = "Nobody yet".
    struct Pick: Equatable {
        let seatId: String?
    }

    /// A `bindName` call is in flight (the rows are disabled).
    @Published private(set) var busy = false
    /// Copy for the last failed `bindName`.
    @Published private(set) var error: String?
    /// A `retireName` call is in flight.
    @Published private(set) var retiring = false
    /// Copy for the last failed `retireName`.
    @Published private(set) var retireError: String?
    /// The tapped row, until the roster shows it.
    @Published private(set) var pending: Pick?

    let key: String
    private let service: GameService
    private let gameId: String

    init(service: GameService, gameId: String, key: String) {
        self.service = service
        self.gameId = gameId
        self.key = key
    }

    /// The row to show as selected.
    /// - Parameter current: the binding the latest roster shows.
    /// - Returns: the pending pick's seat while one is waiting, else `current`.
    func selection(current: String?) -> String? {
        pending.map(\.seatId) ?? current
    }

    /// Feeds in the latest roster's binding; clears the pending pick once they agree.
    /// - Parameter current: the binding the latest roster shows.
    func observe(current: String?) {
        if pending?.seatId == current { pending = nil }
    }

    /// Binds the name to `seatId` (nil = nobody yet). Does nothing while a call is in flight or when
    /// `seatId` is already the selection.
    /// - Parameters:
    ///   - seatId: the seat to bind, or nil to unbind.
    ///   - current: the binding the latest roster shows.
    func bind(_ seatId: String?, current: String?) async {
        guard !busy, !retiring, seatId != selection(current: current) else { return }
        busy = true
        error = nil
        pending = seatId == current ? nil : Pick(seatId: seatId)
        do {
            try await service.bindName(gameId: gameId, key: key, seatId: seatId)
        } catch {
            self.error = ErrorMessages.message(for: error)
            pending = nil
        }
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
