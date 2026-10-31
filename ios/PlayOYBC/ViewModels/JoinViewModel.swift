import Foundation

/// Drives `/g/<CODE>` (web `JoinPage`): resume an existing seat, or take a name and join,
/// including the host-approved seat reclaim.
@MainActor
final class JoinViewModel: ObservableObject {
    enum Phase: Equatable {
        case checking
        case name
        case waiting(gameId: String, reclaimId: String)
        case seated(gameId: String, seatId: String)
        case failed(message: String)
    }

    @Published private(set) var phase: Phase = .checking
    @Published private(set) var error: String?
    @Published private(set) var busy = false
    /// The host turned down the last reclaim request ("The host said no").
    @Published private(set) var denied = false
    /// The last join failed `name-taken`: offer "That's me" (a reclaim) beside picking another name.
    @Published private(set) var taken = false
    /// The game's name as the host set it (nil until known, or when the host set none).
    @Published private(set) var gameName: String?
    /// The host seat's display name (nil until known).
    @Published private(set) var hostName: String?
    let code: String
    private let service: GameService
    private var watchTask: _Concurrency.Task<Void, Never>?

    init(service: GameService, code: String, phase: Phase = .checking, error: String? = nil, denied: Bool = false,
         taken: Bool = false, gameName: String? = nil, hostName: String? = nil) {
        self.service = service
        self.code = code
        self.phase = phase
        self.error = error
        self.denied = denied
        self.taken = taken
        self.gameName = gameName
        self.hostName = hostName
    }

    deinit { watchTask?.cancel() }

    /// Asks the server whether this uid already sits in the game.
    func check() async {
        phase = .checking
        do {
            let me = try await service.whoAmI(code: code)
            absorb(me)
            if let me, let seatId = me.seatId {
                phase = .seated(gameId: me.gameId, seatId: seatId)
            } else {
                phase = .name
            }
        } catch {
            phase = .failed(message: ErrorMessages.message(for: error))
        }
    }

    /// Joins with `name`. A taken name fails `name-taken` (sets `taken`); `reclaim: true` ("That's me")
    /// asks the host for that seat and waits.
    func submit(name: String, reclaim: Bool = false) async {
        busy = true
        error = nil
        denied = false
        taken = false
        defer { busy = false }
        do {
            switch try await service.joinGame(code: code, name: name, reclaim: reclaim) {
            case let .joined(g, s), let .resumed(g, s):
                phase = .seated(gameId: g, seatId: s)
            case let .reclaimPending(g, r):
                phase = .waiting(gameId: g, reclaimId: r)
                watch(gameId: g, reclaimId: r)
            }
        } catch {
            self.error = ErrorMessages.message(for: error)
            taken = AppError.from(error).code == "name-taken"
        }
    }

    /// Keeps the header's game and host names; an answer without them leaves the last known values.
    private func absorb(_ me: WhoAmIRes?) {
        guard let me else { return }
        if let name = me.gameName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { gameName = name }
        if let host = me.hostName?.trimmingCharacters(in: .whitespacesAndNewlines), !host.isEmpty { hostName = host }
    }

    private func backToName(_ message: String) {
        denied = false
        error = message
        phase = .name
    }

    private func watch(gameId: String, reclaimId: String) {
        watchTask?.cancel()
        watchTask = _Concurrency.Task { [weak self, service, code] in
            do {
                for try await status in service.watchReclaim(gameId: gameId, reclaimId: reclaimId) {
                    guard let self, !_Concurrency.Task.isCancelled else { return }
                    switch status {
                    case .pending: continue
                    case .denied:
                        self.error = nil
                        self.denied = true
                        self.phase = .name
                        return
                    case .approved:
                        do {
                            let me = try await service.whoAmI(code: code)
                            self.absorb(me)
                            if let me, let seatId = me.seatId {
                                self.phase = .seated(gameId: me.gameId, seatId: seatId)
                            } else {
                                self.backToName(ErrorMessages.fallback)
                            }
                        } catch {
                            self.backToName(ErrorMessages.message(for: error))
                        }
                        return
                    }
                }
            } catch {
                guard !_Concurrency.Task.isCancelled else { return }
                self?.backToName(ErrorMessages.message(for: error))
            }
        }
    }
}
