import Foundation

/// The host's Launch: fires at once, unless the roster still has names nobody carries — then it
/// asks first ("Launch?" listing those names), since launching deals their tasks to everyone.
/// One call at a time; a failure leaves its copy in `error`.
@MainActor
final class LaunchModel: ObservableObject {
    /// The launch call is in flight.
    @Published private(set) var busy = false
    /// Copy for the last failed launch.
    @Published private(set) var error: String?
    /// The unbound names the confirm lists; empty = the confirm is closed.
    @Published private(set) var confirming: [RosterName] = []

    /// Launch tapped: opens the confirm when `roster` has unbound names, else launches.
    /// - Parameters:
    ///   - roster: the snapshot's roster.
    ///   - perform: the launch call.
    func request(roster: [RosterName], perform: () async throws -> Void) async {
        guard !busy else { return }
        let unbound = LobbyLogic.unboundRosterNames(roster)
        guard unbound.isEmpty else {
            confirming = unbound
            return
        }
        await launch(perform)
    }

    /// The confirm's Launch: closes it and launches.
    /// - Parameter perform: the launch call.
    func confirm(perform: () async throws -> Void) async {
        guard !confirming.isEmpty, !busy else { return }
        confirming = []
        await launch(perform)
    }

    /// The confirm's Cancel (or a scrim tap).
    func cancel() { confirming = [] }

    private func launch(_ perform: () async throws -> Void) async {
        busy = true
        error = nil
        do { try await perform() } catch { self.error = ErrorMessages.message(for: error) }
        busy = false
    }
}
