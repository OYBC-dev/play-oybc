import SwiftUI

/// "The host said no" (web `.denied`): an 8pt red dot and Archivo 700 14pt red copy.
struct DeniedLine: View {
    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(Color.risoRed).frame(width: 8, height: 8)
            Text("The host said no").font(.risoBody(14, .bold)).foregroundStyle(Color.risoRed)
        }
        .accessibilityElement(children: .combine)
    }
}
