import Foundation
import SwiftUI

/// App-wide session and first-run state: sign-in, consent, profile, AI permission and Apple Health sync.
@MainActor
final class AppState: ObservableObject {
    enum Phase: Equatable {
        case loading, signedOut, consent, profile, ready
        case failed(String)
    }

    @Published var phase: Phase = .loading
    @Published var me: Me?
    @Published var consent: Row?
    @Published var profile: Row?
    @Published var showAIPermission = false
    @Published var showPrivacyAfterConsentError = false
    /// Bumped after data changes that several tabs show (new reading, Apple Health import).
    @Published var dataVersion = 0

    let client: APIClient
    let entities: EntityStore
    private(set) var health: HealthKitGlucoseSync?
    private var pendingAIAction: (() -> Void)?

    static let trendCardDayKey = "trendCard.lastShownDay"

    init(arguments: [String] = ProcessInfo.processInfo.arguments) {
        let transport: HTTPTransport
        let tokens: RefreshTokenStore
        if arguments.contains("-uiTestStub") {
            transport = StubTransport(firstRun: arguments.contains("-uiTestFirstRun"))
            tokens = InMemoryTokenStore(token: arguments.contains("-uiTestSignedIn") ? "stub-refresh" : nil)
        } else {
            transport = URLSessionTransport()
            tokens = KeychainStore()
        }
        client = APIClient(baseURL: AppConfig.apiBaseURL, transport: transport, session: SessionStore(tokenStore: tokens))
        entities = EntityStore(client: client)
        client.onSessionEnded = { [weak self] in self?.sessionEnded() }
    }

    // MARK: Session

    func start() async {
        phase = .loading
        do {
            if let me = try await client.restoreSession() {
                await signedIn(me)
            } else {
                phase = .signedOut
            }
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func signedIn(_ me: Me) async {
        self.me = me
        health = HealthKitGlucoseSync(client: client, userID: me.id)
        await loadFirstRun()
    }

    func loadFirstRun() async {
        do {
            consent = try await entities.list(.privacyConsent, limit: 1).first
            guard consent != nil else {
                phase = .consent
                return
            }
            profile = try await entities.list(.userProfile, limit: 1).first
            guard profile != nil else {
                phase = .profile
                return
            }
            phase = .ready
            health?.startBackgroundDelivery()
            await syncHealth()
        } catch {
            phase = .failed(message(for: error))
        }
    }

    private func sessionEnded() {
        me = nil
        consent = nil
        profile = nil
        phase = .signedOut
    }

    private func clearLocalData() {
        health?.disconnect()
        health = nil
        UserDefaults.standard.removeObject(forKey: AppState.trendCardDayKey)
        me = nil
        consent = nil
        profile = nil
    }

    func signOut() async {
        await client.signOut()
        clearLocalData()
        phase = .signedOut
    }

    /// DELETE /api/v1/me. On 204 everything local is removed and sign-in is shown; errors go to the caller
    /// (503 retryable shows 'Try again').
    func deleteAccount() async throws {
        try await client.send("DELETE", Endpoints.me)
        await client.session.clear()
        clearLocalData()
        phase = .signedOut
    }

    // MARK: Consent and profile

    var wearablesAllowed: Bool { consent?.bool("wearables") == true }
    var aiAllowed: Bool { consent?.bool("ai_processing") == true }
    var targetMin: Double { profile?.double("target_glucose_min") ?? 70 }
    var targetMax: Double { profile?.double("target_glucose_max") ?? 140 }

    func saveConsent(_ fields: [String: JSONValue]) async throws {
        var data = fields
        data["consented_at"] = .string(DateText.iso(Date(), timeZone: TimeZone(identifier: "UTC") ?? .current))
        if let consent {
            self.consent = try await entities.update(.privacyConsent, row: consent, data)
        } else {
            consent = try await entities.create(.privacyConsent, data)
        }
        if phase == .consent { await loadFirstRun() }
    }

    func saveProfile(_ fields: [String: JSONValue]) async throws {
        if let profile {
            self.profile = try await entities.update(.userProfile, row: profile, fields)
        } else {
            profile = try await entities.create(.userProfile, fields)
        }
        if phase == .profile { await loadFirstRun() }
    }

    func reloadProfile() async {
        if let fresh = try? await entities.list(.userProfile, limit: 1).first { profile = fresh }
    }

    // MARK: Data helpers for screens

    /// Creates a row, or updates `editing` when set, then tells the other screens to reload.
    func save(_ entity: Entity, editing: Row?, _ fields: [String: JSONValue]) async throws {
        if let editing {
            try await entities.update(entity, row: editing, fields)
        } else {
            try await entities.create(entity, fields)
        }
        dataVersion += 1
    }

    func delete(_ entity: Entity, row: Row) async throws {
        try await entities.delete(entity, id: row.id)
        dataVersion += 1
    }

    /// POST /api/v1/ai/{task}; returns `result`. Callers wrap it in requireAI so the permission comes first.
    func runAI(_ task: String, _ body: [String: JSONValue] = [:]) async throws -> JSONValue {
        let response = try await client.json("POST", Endpoints.ai(task), body: .object(body))
        return response["result"] ?? response
    }

    // MARK: AI permission

    /// Runs `action` if AI processing is allowed; otherwise shows the permission sheet first.
    func requireAI(_ action: @escaping () -> Void) {
        if aiAllowed {
            action()
        } else {
            pendingAIAction = action
            showAIPermission = true
        }
    }

    /// Writes PrivacyConsent.extra.ai_processing (and ai_processing_at) through PATCH /entities/PrivacyConsent/{id}.
    func setAIProcessing(_ allowed: Bool) async throws {
        guard let consent else { return }
        self.consent = try await entities.update(.privacyConsent, row: consent, [
            "ai_processing": .bool(allowed),
            "ai_processing_at": .string(DateText.iso(Date(), timeZone: TimeZone(identifier: "UTC") ?? .current)),
        ])
        let action = pendingAIAction
        pendingAIAction = nil
        if allowed { action?() }
    }

    func declineAI() {
        pendingAIAction = nil
        showAIPermission = false
    }

    // MARK: Apple Health

    func syncHealth() async {
        guard let health, health.isConnected, wearablesAllowed else { return }
        do {
            let result = try await health.sync()
            if result.imported > 0 { dataVersion += 1 }
        } catch HealthKitGlucoseSync.SyncError.consentRequired {
            showPrivacyAfterConsentError = true
        } catch {
            // Kept for the next trigger; the anchor was not advanced.
        }
    }

    func message(for error: Error) -> String {
        (error as? APIError)?.userMessage ?? error.localizedDescription
    }
}
