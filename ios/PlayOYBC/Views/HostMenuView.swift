import SwiftUI

/// Host-only "Host menu" button and sheet: hand the host role to another player after a
/// confirm (web `HostMenu`). Renders nothing for non-hosts.
struct HostMenuView: View {
    let service: GameService
    let gameId: String
    let snapshot: GameSnapshot
    @State var open = false

    var body: some View {
        if snapshot.game.hostSeatId == snapshot.mySeatId {
            RisoButton(title: "Host menu", small: true) { open = true }
                .sheet(isPresented: $open) {
                    HostMenuSheet(service: service, gameId: gameId, snapshot: snapshot) { open = false }
                }
        }
    }
}

/// The host menu's sheet content: the player list, then the "Make <name> host" confirm.
struct HostMenuSheet: View {
    let service: GameService
    let gameId: String
    let snapshot: GameSnapshot
    let onClose: () -> Void
    @State var target: Seat?
    @State var busy = false
    @State var error: String?

    private var others: [Seat] {
        LobbyLogic.seatsByJoin(snapshot.seats).filter { $0.seatId != snapshot.mySeatId }
    }

    var body: some View {
        if let target {
            RisoSheet(title: "Make \(target.name) host", onClose: onClose) {
                Text("\(target.name) takes over hosting. You become a regular player.")
                    .font(.risoBody(16)).foregroundStyle(Color.risoInk)
                    .fixedSize(horizontal: false, vertical: true)
                if let error { ErrorText(error) }
                HStack(spacing: 8) {
                    RisoButton(title: "Cancel", fullWidth: true) { self.target = nil; error = nil }
                    RisoButton(title: "Make host", kind: .primary, fullWidth: true) { transfer(target) }
                        .risoDisabled(busy)
                }
            }
        } else {
            RisoSheet(title: "Host menu", onClose: onClose) {
                if others.isEmpty {
                    MutedText("No other players")
                } else {
                    VStack(spacing: 8) {
                        ForEach(others) { s in
                            HStack {
                                Text(s.name).font(.risoBody(16, .semibold)).foregroundStyle(Color.risoInk)
                                Spacer()
                                RisoButton(title: "Make host", small: true) { error = nil; target = s }
                                    .accessibilityLabel("Make \(s.name) host")
                            }
                            .frame(minHeight: 44)
                        }
                    }
                }
            }
        }
    }

    private func transfer(_ seat: Seat) {
        busy = true
        error = nil
        _Concurrency.Task {
            do {
                try await service.transferHost(gameId: gameId, toSeatId: seat.seatId)
                busy = false
                onClose()
            } catch {
                self.error = ErrorMessages.message(for: error)
                busy = false
            }
        }
    }
}
