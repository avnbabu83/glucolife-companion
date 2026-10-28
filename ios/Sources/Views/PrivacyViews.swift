import SwiftUI

/// Privacy consent, the same four permissions as the web dialog. Used on first run and from More > Privacy.
struct PrivacyConsentView: View {
    @EnvironmentObject private var app: AppState
    var firstRun = false

    @State private var location = false
    @State private var cgm = false
    @State private var wearables = false
    @State private var email = true
    @State private var aiProcessing = false
    @State private var saving = false
    @State private var errorText: String?
    @State private var saved = false

    var body: some View {
        Form {
            Section {
                Text("Choose what DiabetEasy may use. You can change this at any time in More > Privacy.")
                    .font(.callout)
            }
            Section("Permissions") {
                Toggle(isOn: $location) {
                    permission("Location", "Suggest nearby healthy meal options and activity ideas.")
                }
                Toggle(isOn: $cgm) {
                    permission("CGM data", "Connect continuous glucose monitors such as FreeStyle Libre or Dexcom.")
                }
                Toggle(isOn: $wearables) {
                    permission("Wearables", "Sync with Fitbit, Apple Health, or Google Fit for glucose, activity, sleep and heart rate data.")
                }
                .accessibilityIdentifier("consent-wearables")
                Toggle(isOn: $email) {
                    permission("Email updates", "Weekly insights and progress summaries by email.")
                }
            }
            if !firstRun {
                Section("AI analysis") {
                    Toggle(isOn: $aiProcessing) {
                        permission("Allow AI processing",
                                   "Glucose, meal and activity data and photos are sent to Anthropic's Claude to produce analyses and plans.")
                    }
                    .accessibilityIdentifier("consent-ai")
                }
            }
            if let errorText {
                Section { Text(errorText).foregroundStyle(.red) }
            }
            Section {
                SaveButton(title: firstRun ? "Continue" : "Save", saving: saving) { save() }
                    .accessibilityIdentifier("consent-save")
                if saved { Text("Saved").foregroundStyle(.secondary) }
            }
        }
        .navigationTitle(firstRun ? "Your privacy" : "Privacy")
        .onAppear(perform: load)
    }

    private func permission(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
            Text(detail).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func load() {
        guard let consent = app.consent else { return }
        location = consent.bool("location") ?? false
        cgm = consent.bool("cgm") ?? false
        wearables = consent.bool("wearables") ?? false
        email = consent.bool("email") ?? true
        aiProcessing = consent.bool("ai_processing") ?? false
    }

    private func save() {
        saving = true
        errorText = nil
        saved = false
        Task {
            do {
                let aiChanged = !firstRun && aiProcessing != app.aiAllowed
                try await app.saveConsent([
                    "location": .bool(location), "cgm": .bool(cgm), "wearables": .bool(wearables), "email": .bool(email),
                ])
                if aiChanged { try await app.setAIProcessing(aiProcessing) }
                if !wearables, let health = app.health, health.isConnected { health.disconnect() }
                saved = true
            } catch {
                errorText = app.message(for: error)
            }
            saving = false
        }
    }
}

/// One-time sheet before the first AI action (App Store guidelines 5.1.2 and 5.1.3).
struct AIPermissionSheet: View {
    @EnvironmentObject private var app: AppState
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("AI analysis", systemImage: "sparkles").font(.title2.bold())
            Text("To create this analysis, DiabetEasy sends your glucose readings (including Apple Health readings), meals, activity, sleep and any photo you attach to Anthropic's Claude AI service. Your name and email are not sent.")
            Text("You can turn this off at any time in More > Privacy. AI suggestions are not medical advice.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let errorText { Text(errorText).foregroundStyle(.red).font(.footnote) }
            Spacer()
            Button {
                allow()
            } label: {
                Group {
                    if saving { ProgressView() } else { Text("Allow").bold() }
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .disabled(saving)
            .accessibilityIdentifier("ai-allow")
            Button("Not now") { app.declineAI() }
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("ai-not-now")
        }
        .padding(24)
        .presentationDetents([.medium, .large])
    }

    private func allow() {
        saving = true
        Task {
            do {
                app.showAIPermission = false
                try await app.setAIProcessing(true)
            } catch {
                errorText = app.message(for: error)
                app.showAIPermission = true
            }
            saving = false
        }
    }
}
