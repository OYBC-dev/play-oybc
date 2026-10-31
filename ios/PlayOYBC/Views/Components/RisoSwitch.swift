import SwiftUI

/// The Riso on/off switch (web `LobbySheet.module.css` `.switch`): a 52×30 capsule with a 2pt ink
/// keyline and a 2pt hard shadow, a 20pt paper knob with its own keyline, the track paper-2 when off
/// and blue when on. The label sits on the leading side; the whole row toggles.
struct RisoSwitchStyle: ToggleStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.15)) { configuration.isOn.toggle() }
        } label: {
            HStack(alignment: .center, spacing: 12) {
                configuration.label
                Spacer(minLength: 0)
                track(on: configuration.isOn)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(isEnabled ? 1 : 0.5)
        .accessibilityRepresentation { Toggle(isOn: configuration.$isOn) { configuration.label } }
    }

    private func track(on: Bool) -> some View {
        Capsule()
            .fill(on ? Color.risoBlue : Color.risoPaper2)
            .overlay(Capsule().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
            .clipShape(Capsule())
            .risoHardShadow(Riso.Shadow.small, in: Capsule())
            .overlay(alignment: on ? .trailing : .leading) {
                Circle()
                    .fill(Color.risoPaper)
                    .overlay(Circle().strokeBorder(Color.risoInk, lineWidth: Riso.Keyline.container))
                    .frame(width: 20, height: 20)
                    .padding(5)
            }
            .frame(width: 52, height: 30)
            .accessibilityHidden(true)
    }
}
