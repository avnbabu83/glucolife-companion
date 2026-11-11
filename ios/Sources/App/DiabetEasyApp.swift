import SwiftUI

@main
struct DiabetEasyApp: App {
    @StateObject private var app = AppState()

    init() {
        Bento.applyBarAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .tint(Color.accentColor)
                .font(Bento.body)
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
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(BentoBackground())
            case .signedOut:
                SignInView()
            case .consent:
                NavigationStack { PrivacyConsentView(firstRun: true).bentoScreen() }
            case .profile:
                NavigationStack { ProfileView(firstRun: true).bentoScreen() }
            case .ready:
                MainTabView()
            case .failed(let message):
                VStack(spacing: 16) {
                    ErrorBanner(message: message) { retry() }
                    Button("Sign out") { Task { await app.signOut() } }
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(BentoBackground())
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
            NavigationStack { DashboardView().bentoScreen() }
                .tabItem { Label("Today", systemImage: "square.grid.2x2") }
            NavigationStack { LogView().bentoScreen() }
                .tabItem { Label("Log", systemImage: "square.and.pencil") }
            NavigationStack { MealsView().bentoScreen() }
                .tabItem { Label("Plans", systemImage: "fork.knife") }
            NavigationStack { InsightsView().bentoScreen() }
                .tabItem { Label("Insights", systemImage: "sparkles") }
            NavigationStack { MoreView().bentoScreen() }
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
        .sheet(isPresented: $app.showPrivacyAfterConsentError) {
            NavigationStack { PrivacyConsentView() }
        }
    }
}
