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
    let code: String
    private let service: GameService
    private var watchTask: _Concurrency.Task<Void, Never>?

    init(service: GameService, code: String, phase: Phase = .checking) {
        self.service = service
        self.code = code
        self.phase = phase
    }

    deinit { watchTask?.cancel() }

    /// Asks the server whether this uid already sits in the game.
    func check() async {
        phase = .checking
        do {
            if let me = try await service.whoAmI(code: code) {
                phase = .seated(gameId: me.gameId, seatId: me.seatId)
            } else {
                phase = .name
            }
        } catch {
            phase = .failed(message: ErrorMessages.message(for: error))
        }
    }

    /// Joins with `name`; a taken name held by another device waits for the host.
    func submit(name: String) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            switch try await service.joinGame(code: code, name: name) {
            case let .joined(g, s), let .resumed(g, s):
                phase = .seated(gameId: g, seatId: s)
            case let .reclaimPending(g, r):
                phase = .waiting(gameId: g, reclaimId: r)
                watch(gameId: g, reclaimId: r)
            }
        } catch {
            self.error = ErrorMessages.message(for: error)
        }
    }

    private func backToName(_ message: String) {
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
                        self.backToName("The host said no")
                        return
                    case .approved:
                        do {
                            if let me = try await service.whoAmI(code: code) {
                                self.phase = .seated(gameId: me.gameId, seatId: me.seatId)
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
