import SwiftUI
import UIKit

/// Daily Bento look: background #EEF3FB, surface #FFFFFF, text #0F1B33, primary #2F52C9, accent #0E8F82.
/// Headings and tile numbers use Plus Jakarta Sans (bold), labels and body use Inter. When the font files are not
/// bundled, Font.custom and the UIFont fallbacks below use the system font, so the app never breaks.
enum Bento {
    static let background = Color(red: 0xEE / 255, green: 0xF3 / 255, blue: 0xFB / 255)
    static let surface = Color.white
    static let text = Color(red: 0x0F / 255, green: 0x1B / 255, blue: 0x33 / 255)
    static let primary = Color(red: 0x2F / 255, green: 0x52 / 255, blue: 0xC9 / 255)
    static let accent = Color(red: 0x0E / 255, green: 0x8F / 255, blue: 0x82 / 255)
    static let mint = Color(red: 0x78 / 255, green: 0xD6 / 255, blue: 0xC4 / 255)

    static let headingFont = "PlusJakartaSans-Bold"
    static let bodyFont = "Inter-Regular"
    static let tileRadius: CGFloat = 24

    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        Font.custom(headingFont, size: size, relativeTo: style).weight(.bold)
    }

    static func number(_ size: CGFloat = 30) -> Font {
        Font.custom(headingFont, size: size, relativeTo: .title).weight(.heavy).monospacedDigit()
    }

    static func label(_ size: CGFloat = 13, relativeTo style: Font.TextStyle = .caption) -> Font {
        Font.custom(bodyFont, size: size, relativeTo: style)
    }

    static let body = Font.custom(bodyFont, size: 17, relativeTo: .body)

    /// Navigation and tab bar titles in the heading font, applied once at launch.
    static func applyBarAppearance() {
        let text = UIColor(red: 0x0F / 255, green: 0x1B / 255, blue: 0x33 / 255, alpha: 1)
        let large = UIFont(name: headingFont, size: 32) ?? .systemFont(ofSize: 32, weight: .bold)
        let inline = UIFont(name: headingFont, size: 17) ?? .systemFont(ofSize: 17, weight: .bold)
        UINavigationBar.appearance().largeTitleTextAttributes = [.font: large, .foregroundColor: text]
        UINavigationBar.appearance().titleTextAttributes = [.font: inline, .foregroundColor: text]
    }
}

/// The pale blue-to-mint gradient mesh behind every screen. Its only motion is a very slow drift, and none when
/// the person has asked for reduced motion.
struct BentoBackground: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drift = false

    var body: some View {
        GeometryReader { geometry in
            let size = max(geometry.size.width, geometry.size.height)
            ZStack {
                Bento.background
                RadialGradient(colors: [Bento.primary.opacity(0.16), .clear], center: .topLeading,
                               startRadius: 0, endRadius: size * 0.55)
                RadialGradient(colors: [Bento.accent.opacity(0.14), .clear], center: .topTrailing,
                               startRadius: 0, endRadius: size * 0.5)
                RadialGradient(colors: [Bento.mint.opacity(0.22), .clear], center: .bottomTrailing,
                               startRadius: 0, endRadius: size * 0.6)
                RadialGradient(colors: [Bento.primary.opacity(0.10), .clear], center: .bottomLeading,
                               startRadius: 0, endRadius: size * 0.5)
            }
            .scaleEffect(drift ? 1.06 : 1)
            .offset(x: drift ? geometry.size.width * 0.03 : 0, y: drift ? -geometry.size.height * 0.02 : 0)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 60).repeatForever(autoreverses: true)) { drift = true }
        }
    }
}

/// A frosted white tile.
struct BentoTileModifier: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: Bento.tileRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(RoundedRectangle(cornerRadius: Bento.tileRadius, style: .continuous)
                        .fill(Color.white.opacity(0.55)))
            }
            .overlay(RoundedRectangle(cornerRadius: Bento.tileRadius, style: .continuous)
                .stroke(Color.white.opacity(0.85), lineWidth: 1))
            .shadow(color: Bento.text.opacity(0.06), radius: 12, x: 0, y: 6)
    }
}

/// Tiles rise in with a short stagger on load (no motion when reduced motion is on).
struct BentoRiseModifier: ViewModifier {
    let index: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 12)
            .onAppear {
                if reduceMotion {
                    shown = true
                } else {
                    withAnimation(.easeOut(duration: 0.45).delay(Double(min(index, 6)) * 0.05)) { shown = true }
                }
            }
    }
}

/// Tiles lift slightly with a soft shadow while pressed.
struct BentoPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        PressBody(configuration: configuration)
    }

    private struct PressBody: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            configuration.label
                .offset(y: configuration.isPressed && !reduceMotion ? -3 : 0)
                .shadow(color: Bento.text.opacity(configuration.isPressed ? 0.12 : 0), radius: 18, x: 0, y: 10)
                .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: configuration.isPressed)
        }
    }
}

/// A pill-shaped action button (the main actions under the greeting).
struct BentoPill: View {
    let title: String
    let systemImage: String
    var filled = false

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(Bento.label(15, relativeTo: .subheadline).weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .foregroundStyle(filled ? Color.white : Bento.primary)
            .background {
                if filled {
                    Capsule().fill(Bento.primary)
                } else {
                    Capsule().fill(.ultraThinMaterial)
                        .overlay(Capsule().fill(Color.white.opacity(0.6)))
                }
            }
            .overlay(Capsule().stroke(Color.white.opacity(0.85), lineWidth: 1))
    }
}

extension View {
    func bentoTile(padding: CGFloat = 16) -> some View { modifier(BentoTileModifier(padding: padding)) }

    func bentoRise(_ index: Int) -> some View { modifier(BentoRiseModifier(index: index)) }

    /// Gradient mesh behind the screen, transparent list and form backgrounds, frosted navigation and tab bars.
    func bentoScreen() -> some View {
        self
            .scrollContentBackground(.hidden)
            .background(BentoBackground())
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar, .tabBar)
            .toolbarBackground(.visible, for: .tabBar)
    }
}
