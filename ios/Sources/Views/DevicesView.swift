import AuthenticationServices
import SwiftUI

/// Devices: FreeStyle Libre, Fitbit, Apple Health, and simulated Dexcom/Medtronic (as on the web).
struct DevicesView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        Form {
            AppleHealthSection()
            LibreSection()
            FitbitSection()
            SimulatedCGMSection()
        }
        .navigationTitle("Devices")
        .task { await app.reloadProfile() }
    }
}

// MARK: - Apple Health

struct AppleHealthSection: View {
    @EnvironmentObject var app: AppState
    @State private var busy = false
    @State private var status: String?
    @State private var connected = false

    var body: some View {
        Section {
            if !HealthKitGlucoseSync.isAvailable {
                Text("Apple Health is not available on this device.").foregroundStyle(.secondary)
            } else if !app.wearablesAllowed {
                Text("Turn on Wearables in Privacy to connect Apple Health.").foregroundStyle(.secondary)
                NavigationLink("Open Privacy") { PrivacyConsentView() }
            } else if connected, let health = app.health {
                if let last = health.lastImport {
                    Text("Last import: \(last.formatted(date: .abbreviated, time: .shortened))")
                }
                if let counts = health.lastCounts {
                    Text("Imported \(counts.imported), skipped \(counts.skipped)").foregroundStyle(.secondary)
                }
                Button {
                    run { try await health.sync() }
                } label: {
                    HStack { if busy { ProgressView() }; Text("Sync now") }
                }
                .disabled(busy)
                Button("Disconnect Apple Health", role: .destructive) {
                    health.disconnect()
                    connected = false
                }
            } else {
                Text("Read your blood glucose readings from Apple Health. DiabetEasy never writes to Apple Health.")
                    .font(.callout)
                Button {
                    run {
                        guard let health = app.health else { return GlucoseImportResult() }
                        return try await health.connect()
                    }
                } label: {
                    HStack { if busy { ProgressView() }; Text("Connect Apple Health") }
                }
                .disabled(busy)
                .accessibilityIdentifier("connect-apple-health")
            }
            if let status { Text(status).font(.footnote).foregroundStyle(.secondary) }
        } header: {
            Label("Apple Health", systemImage: "heart.text.square")
        }
        .onAppear { connected = app.health?.isConnected ?? false }
    }

    private func run(_ work: @escaping () async throws -> GlucoseImportResult) {
        busy = true
        status = nil
        Task {
            do {
                let result = try await work()
                connected = app.health?.isConnected ?? false
                status = result.received == 0
                    ? "No new readings found. If you expected some, check Health > Data Access."
                    : "Imported \(result.imported), skipped \(result.skipped)."
                if result.imported > 0 { app.dataVersion += 1 }
            } catch HealthKitGlucoseSync.SyncError.consentRequired {
                status = "Wearables consent is off. Turn it on in Privacy to keep importing."
                app.showPrivacyAfterConsentError = true
            } catch {
                status = (error as? APIError)?.userMessage ?? "Apple Health import failed. It will retry later."
            }
            busy = false
        }
    }
}

// MARK: - FreeStyle Libre (LibreConnect.jsx)

struct LibreSection: View {
    @EnvironmentObject var app: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var status: String?

    private var connected: Bool { app.profile?.bool("libre_connected") == true }

    var body: some View {
        Section {
            if connected {
                Text("Connected\(app.profile?.string("libre_email").map { " as \($0)" } ?? "")")
                Button { sync() } label: { HStack { if busy { ProgressView() }; Text("Sync now") } }.disabled(busy)
                Button("Disconnect", role: .destructive) { disconnect() }.disabled(busy)
            } else {
                Text("Sign in with your LibreLinkUp account. Your password is sent once to DiabetEasy and never stored on this iPhone.")
                    .font(.caption).foregroundStyle(.secondary)
                TextField("LibreLinkUp email", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password", text: $password)
                Button { connect() } label: { HStack { if busy { ProgressView() }; Text("Connect Libre") } }
                    .disabled(busy || email.isEmpty || password.isEmpty)
            }
            if let status { Text(status).font(.footnote).foregroundStyle(.secondary) }
        } header: {
            Label("FreeStyle Libre", systemImage: "sensor.tag.radiowaves.forward")
        }
    }

    private func connect() {
        let body: JSONValue = .object(["email": .string(email), "password": .string(password)])
        busy = true
        status = nil
        Task {
            do {
                _ = try await app.client.json("POST", Endpoints.integration("libre", "connect"), body: body)
                password = ""
                await app.reloadProfile()
                await syncNow()
            } catch {
                status = message(error)
            }
            busy = false
        }
    }

    private func sync() {
        busy = true
        Task {
            await syncNow()
            busy = false
        }
    }

    private func syncNow() async {
        do {
            let result = try await app.client.json("POST", Endpoints.integration("libre", "sync"), body: .object([:]))
            status = "Imported \(Num.text(result["imported"]?.doubleValue ?? 0)), skipped \(Num.text(result["skipped"]?.doubleValue ?? 0))."
            app.dataVersion += 1
        } catch {
            status = message(error)
            if (error as? APIError)?.needsAuth == true { await app.reloadProfile() }
        }
    }

    private func disconnect() {
        busy = true
        Task {
            _ = try? await app.client.json("POST", Endpoints.integration("libre", "disconnect"), body: .object([:]))
            await app.reloadProfile()
            busy = false
        }
    }

    private func message(_ error: Error) -> String {
        guard let api = error as? APIError else { return error.localizedDescription }
        if api.needsAuth { return "Please connect Libre again: \(api.message)" }
        if api.status == 502 { return "LibreLinkUp is unavailable right now. Please try again later." }
        return api.userMessage
    }
}

// MARK: - Fitbit (ASWebAuthenticationSession, PKCE)

struct FitbitSection: View {
    @EnvironmentObject var app: AppState
    @Environment(\.webAuthenticationSession) var webAuthenticationSession
    @State private var busy = false
    @State private var status: String?

    private var connected: Bool { app.profile?.bool("fitbit_connected") == true }

    var body: some View {
        Section {
            if connected {
                Text("Connected")
                Button { sync() } label: { HStack { if busy { ProgressView() }; Text("Sync now") } }.disabled(busy)
                Button("Disconnect", role: .destructive) { disconnect() }.disabled(busy)
            } else {
                Text("Import sleep and activity from Fitbit.").font(.caption).foregroundStyle(.secondary)
                Button { Task { await connect() } } label: {
                    HStack { if busy { ProgressView() }; Text(status == nil ? "Connect Fitbit" : "Try again") }
                }
                .disabled(busy)
            }
            if let status { Text(status).font(.footnote).foregroundStyle(.secondary) }
        } header: {
            Label("Fitbit", systemImage: "figure.walk.motion")
        }
    }

    private func connect() async {
        let verifier = AuthCrypto.randomHex()
        let state = AuthCrypto.randomHex(byteCount: 16)
        guard !AppConfig.fitbitClientID.hasPrefix("REPLACE"),
              let url = AuthCrypto.fitbitAuthorizeURL(clientID: AppConfig.fitbitClientID,
                                                      redirectURI: AppConfig.fitbitRedirectURI,
                                                      verifier: verifier, state: state) else {
            status = "Fitbit is not set up in this build."
            return
        }
        busy = true
        defer { busy = false }
        do {
            let callback = try await webAuthenticationSession.authenticate(
                using: url, callbackURLScheme: AppConfig.fitbitCallbackScheme, preferredBrowserSession: .ephemeral)
            guard let code = AuthCrypto.authorizationCode(from: callback, expectedState: state) else {
                status = "Fitbit not connected."
                return
            }
            _ = try await app.client.json("POST", Endpoints.integration("fitbit", "connect"), body: .object([
                "code": .string(code), "redirect_uri": .string(AppConfig.fitbitRedirectURI),
                "code_verifier": .string(verifier),
            ]))
            status = nil
            await app.reloadProfile()
        } catch {
            status = "Fitbit not connected."
        }
    }

    private func sync() {
        busy = true
        Task {
            do {
                let result = try await app.client.json("POST", Endpoints.integration("fitbit", "sync"), body: .object([:]))
                status = "Synced \(Num.text(result["sleep_logs"]?.doubleValue ?? 0)) sleep logs\(result["activity_updated"]?.boolValue == true ? " and today's activity" : "")."
                app.dataVersion += 1
            } catch let error as APIError where error.needsAuth {
                status = "Please connect Fitbit again."
                await app.reloadProfile()
            } catch {
                status = (error as? APIError)?.status == 502 ? "Fitbit is unavailable right now." : app.message(for: error)
            }
            busy = false
        }
    }

    private func disconnect() {
        busy = true
        Task {
            _ = try? await app.client.json("POST", Endpoints.integration("fitbit", "disconnect"), body: .object([:]))
            await app.reloadProfile()
            busy = false
        }
    }
}

// MARK: - Dexcom and Medtronic (simulated, as on the web)

struct SimulatedCGMSection: View {
    @EnvironmentObject var app: AppState
    @State private var connecting: String?

    static let devices = [("dexcom_g7", "Dexcom G6/G7"), ("medtronic", "Medtronic Guardian")]

    var body: some View {
        Section {
            ForEach(0..<SimulatedCGMSection.devices.count, id: \.self) { index in
                let device = SimulatedCGMSection.devices[index]
                HStack {
                    Text(device.1)
                    Spacer()
                    if app.profile?.string("cgm_device") == device.0 {
                        Text("Connected (simulated)").font(.caption).foregroundStyle(.secondary)
                    } else if connecting == device.0 {
                        ProgressView()
                    } else {
                        Button("Connect") { connect(device.0) }.buttonStyle(.borderless)
                    }
                }
            }
        } header: {
            Text("Other CGMs")
        } footer: {
            Text("Dexcom and Medtronic connections are simulated in this version; no readings are imported.")
        }
    }

    private func connect(_ device: String) {
        connecting = device
        Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            try? await app.saveProfile(["cgm_device": .string(device)])
            connecting = nil
        }
    }
}
