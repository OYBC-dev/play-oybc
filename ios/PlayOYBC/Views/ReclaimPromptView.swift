import SwiftUI

/// Host-only: one row per pending reclaim with Allow / Deny (web `ReclaimPrompt`).
/// Renders nothing when none are pending.
struct ReclaimPromptView: View {
    let service: GameService
    let gameId: String
    let reclaims: [Reclaim]
    @State var busy: String?
    @State var error: String?

    var body: some View {
        if !reclaims.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(reclaims) { r in
                    HStack(spacing: 8) {
                        Text("Someone wants to take \(r.doc.name)'s seat")
                            .font(.risoBody(15, .semibold))
                            .foregroundStyle(Color.risoInk)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        RisoButton(title: "Allow", kind: .green, small: true) { resolve(r.id, true) }
                            .risoDisabled(busy == r.id)
                        RisoButton(title: "Deny", small: true) { resolve(r.id, false) }
                            .risoDisabled(busy == r.id)
                    }
                    .frame(minHeight: 44)
                }
                if let error { ErrorText(error) }
            }
            .padding(Riso.cardPadding)
            .risoCard(fill: .risoPaper2)
            .risoHardShadow(Riso.Shadow.card)
            .accessibilityIdentifier("reclaim-prompt")
        }
    }

    private func resolve(_ id: String, _ approve: Bool) {
        busy = id
        error = nil
        _Concurrency.Task {
            do { try await service.resolveReclaim(gameId: gameId, reclaimId: id, approve: approve) }
            catch { self.error = ErrorMessages.message(for: error) }
            busy = nil
        }
    }
}
