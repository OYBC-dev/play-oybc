import SwiftUI

/// Resolves reclaim requests (Allow / Deny) and tracks the one in flight (web `ReclaimPrompt`).
@MainActor
final class ReclaimPromptModel: ObservableObject {
    @Published var busy: String?
    @Published var error: String?
    private let service: GameService
    private let gameId: String

    init(service: GameService, gameId: String) {
        self.service = service
        self.gameId = gameId
    }

    /// Approves or denies one request; a failure shows its message and re-enables the row.
    func resolve(_ id: String, approve: Bool) async {
        busy = id
        error = nil
        do { try await service.resolveReclaim(gameId: gameId, reclaimId: id, approve: approve) }
        catch { self.error = ErrorMessages.message(for: error) }
        busy = nil
    }
}

/// Host-only toast: one card per pending reclaim, pinned under the top safe area over
/// whatever stage is showing (web `ReclaimPrompt`, z-index 35). Renders nothing when none
/// are pending; outside its own frame touches reach the screen beneath.
struct ReclaimPromptView: View {
    let reclaims: [Reclaim]
    @StateObject private var model: ReclaimPromptModel

    init(service: GameService, gameId: String, reclaims: [Reclaim]) {
        self.reclaims = reclaims
        _model = StateObject(wrappedValue: ReclaimPromptModel(service: service, gameId: gameId))
    }

    var body: some View {
        if !reclaims.isEmpty {
            // Sized against the container it is laid out in (the space the overlay proposes,
            // less the top and bottom clearance): the stack shows whole when it fits, and a
            // taller stack scrolls inside that height.
            ViewThatFits(in: .vertical) {
                stack
                ScrollView { stack }
                    .scrollBounceBehavior(.basedOnSize)
            }
            .frame(maxWidth: 480)
            .padding(.top, 10)
            .padding(.bottom, Self.bottomClearance)
            .accessibilityIdentifier("reclaim-prompt")
        }
    }

    /// Container height the toast leaves free below itself (with the 10 pt top: 120 pt).
    static let bottomClearance: CGFloat = 110

    private var stack: some View {
        VStack(spacing: 10) {
            ForEach(reclaims) { r in card(r) }
            if let error = model.error { ErrorText(error) }
        }
        // Room for the cards' hard shadow inside the scroll bounds.
        .padding(.leading, Riso.gutter)
        .padding(.trailing, Riso.gutter + Riso.Shadow.large)
        .padding(.bottom, Riso.Shadow.large)
    }

    private func card(_ r: Reclaim) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Someone wants to take \(r.doc.name)'s seat")
                .font(.risoHead(19, .extraBold)).tracking(-0.19)
                .foregroundStyle(Color.risoInk)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                RisoButton(title: "Allow", kind: .green, fullWidth: true) { resolve(r.id, true) }
                RisoButton(title: "Deny", fullWidth: true) { resolve(r.id, false) }
            }
            .risoDisabled(model.busy == r.id)
        }
        .padding(Riso.cardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .risoCard()
        .risoHardShadow(Riso.Shadow.large)
        .accessibilityElement(children: .contain)
    }

    private func resolve(_ id: String, _ approve: Bool) {
        _Concurrency.Task { await model.resolve(id, approve: approve) }
    }
}
