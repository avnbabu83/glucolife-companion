import SwiftUI

@main
struct DiabetEasyApp: App {
    @StateObject private var app = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .tint(Color.accentColor)
        }
    }
}

/// Sign-in, then first run (consent, then profile), then the five tabs.
struct RootView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.scenePhase) var scenePhase
    @State private var started = false

    var body: some View {
        Group {
            switch app.phase {
            case .loading:
                ProgressView("Loading…")
            case .signedOut:
                SignInView()
            case .consent:
                NavigationStack { PrivacyConsentView(firstRun: true) }
            case .profile:
                NavigationStack { ProfileView(firstRun: true) }
            case .ready:
                MainTabView()
            case .failed(let message):
                VStack(spacing: 16) {
                    ErrorBanner(message: message) { retry() }
                    Button("Sign out") { Task { await app.signOut() } }
                }
                .padding()
            }
        }
        .sheet(isPresented: $app.showAIPermission) {
            AIPermissionSheet()
        }
        .task {
            guard !started else { return }
            started = true
            await app.start()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && app.phase == .ready {
                Task { await app.syncHealth() }
            }
        }
    }

    private func retry() {
        Task {
            if app.me != nil { await app.loadFirstRun() } else { await app.start() }
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        TabView {
            NavigationStack { DashboardView() }
                .tabItem { Label("Dashboard", systemImage: "chart.line.uptrend.xyaxis") }
            NavigationStack { LogView() }
                .tabItem { Label("Log", systemImage: "square.and.pencil") }
            NavigationStack { MealsView() }
                .tabItem { Label("Meals", systemImage: "fork.knife") }
            NavigationStack { InsightsView() }
                .tabItem { Label("Insights", systemImage: "sparkles") }
            NavigationStack { MoreView() }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
        .sheet(isPresented: $app.showPrivacyAfterConsentError) {
            NavigationStack { PrivacyConsentView() }
        }
    }
}
