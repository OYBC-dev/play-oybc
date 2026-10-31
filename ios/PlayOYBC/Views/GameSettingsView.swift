import SwiftUI

/// Game settings, between Home's "Host a game" and the lobby (handoff v2 §1, web `/host`): header
/// (mark, `Host` kicker, `Game settings`, ghost Back), the Game name card, the Board card (Free space
/// switch, derived Tasks per board) and Create game with the "Hosting as" line under it.
struct GameSettingsView: View {
    @ObservedObject var model: GameSettingsModel
    /// Back to Home (the typed name stays there).
    let onBack: () -> Void
    /// The game exists: seat the host as Home did.
    let onCreated: (CreateGameRes) -> Void

    var body: some View {
        RisoPage(gutter: Riso.gutter, top: 36, bottom: 32, spacing: 20) {
            header
            RisoCardBox {
                SectionLabel("Game name").accessibilityHidden(true)
                RisoInputField(placeholder: "", text: $model.gameName, maxLength: GameSettingsModel.maxGameName,
                               capitalization: .sentences, accessibilityName: "Game name") { create() }
                helper("Shown in the lobby. Optional.")
            }
            RisoCardBox {
                SectionLabel("Board")
                Toggle(isOn: $model.freeSpace) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Free space").font(.risoHead(15, .extraBold)).foregroundStyle(Color.risoInk)
                        helper("The centre square starts marked. Boards need 24 tasks instead of 25.")
                    }
                }
                .toggleStyle(RisoSwitchStyle())
                .disabled(model.busy)
                .accessibilityIdentifier("free-space")
                Rectangle().fill(Color.risoHair).frame(height: 1).accessibilityHidden(true)
                HStack(spacing: 12) {
                    Text("Tasks per board").font(.risoHead(15, .extraBold)).foregroundStyle(Color.risoInk)
                    Spacer(minLength: 0)
                    Text("\(model.tasksPerBoard)").font(.risoHead(16, .extraBold)).foregroundStyle(Color.risoMuted)
                        .accessibilityIdentifier("tasks-per-board")
                }
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
            }
            VStack(spacing: 10) {
                RisoButton(title: "Create game", kind: .primary, fullWidth: true, large: true) { create() }
                    .risoDisabled(model.busy)
                    .accessibilityIdentifier("create-game")
                if let error = model.error { ErrorText(error).frame(maxWidth: .infinity, alignment: .leading) }
                Text("Hosting as \(model.hostName) · settings lock once the game is created")
                    .font(.risoBody(12.5, .semibold))
                    .foregroundStyle(Color.risoMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// Mark, `Host` kicker over `Game settings`, ghost Back (iOS has no browser back).
    private var header: some View {
        HStack(spacing: 14) {
            PlayBrandMark(size: .header)
            VStack(alignment: .leading, spacing: 4) {
                Text("Host").risoKicker()
                Text("Game settings")
                    .font(.risoHead(30, .extraBold))
                    .tracking(-0.6)
                    .foregroundStyle(Color.risoInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 8)
            RisoButton(title: "Back", kind: .ghost, action: onBack)
                .disabled(model.busy)
        }
    }

    private func helper(_ text: String) -> some View {
        Text(text)
            .font(.risoBody(12.5, .semibold))
            .foregroundStyle(Color.risoMuted)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func create() {
        _Concurrency.Task {
            if let res = await model.create() { onCreated(res) }
        }
    }
}
