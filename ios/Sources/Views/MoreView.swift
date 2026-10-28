import SwiftUI

/// More tab: profile, medication, sleep history, devices, privacy, sign out and delete account.
struct MoreView: View {
    @EnvironmentObject var app: AppState
    @State private var confirmSignOut = false

    var body: some View {
        List {
            Section {
                if let me = app.me {
                    VStack(alignment: .leading) {
                        Text(me.fullName ?? "Your account").bold()
                        Text(me.email).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Section {
                NavigationLink { ProfileView() } label: { Label("Profile", systemImage: "person") }
                    .accessibilityIdentifier("more-profile")
                NavigationLink { MedicationView() } label: { Label("Medication", systemImage: "pills") }
                    .accessibilityIdentifier("more-medication")
                NavigationLink { SleepLogView() } label: { Label("Sleep history", systemImage: "moon") }
                    .accessibilityIdentifier("more-sleep")
                NavigationLink { DevicesView() } label: { Label("Devices", systemImage: "sensor") }
                    .accessibilityIdentifier("more-devices")
                NavigationLink { PrivacyConsentView() } label: { Label("Privacy", systemImage: "hand.raised") }
                    .accessibilityIdentifier("more-privacy")
            }
            Section {
                Button("Sign out") { confirmSignOut = true }
                    .accessibilityIdentifier("more-sign-out")
                NavigationLink { DeleteAccountView() } label: {
                    Text("Delete account").foregroundStyle(.red)
                }
                .accessibilityIdentifier("more-delete-account")
            } footer: {
                Text("Signing out also signs you out of DiabetEasy on the web.")
            }
            Section {
                Text("DiabetEasy does not provide medical advice. Always follow your care team's guidance.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Link("Privacy policy", destination: AppConfig.privacyPolicyURL)
            }
        }
        .navigationTitle("More")
        .confirmationDialog("Sign out of DiabetEasy?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await app.signOut() } }
        }
    }
}

/// In-app account deletion (App Store rule 5.1.1(v)): DELETE /api/v1/me.
struct DeleteAccountView: View {
    @EnvironmentObject var app: AppState
    @State private var confirm = false
    @State private var deleting = false
    @State private var errorText: String?

    var body: some View {
        Form {
            Section {
                Text("Deleting your account permanently removes your profile, glucose readings, meals, workouts, sleep, stress and medication logs, uploaded photos and device connections, on the web and on this iPhone. This cannot be undone.")
                Text("Readings stay in Apple Health; DiabetEasy only stops reading them.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let errorText {
                Section { Text(errorText).foregroundStyle(.red) }
            }
            Section {
                Button(role: .destructive) {
                    confirm = true
                } label: {
                    HStack {
                        Spacer()
                        if deleting { ProgressView() } else { Text(errorText == nil ? "Delete my account" : "Try again").bold() }
                        Spacer()
                    }
                }
                .disabled(deleting)
                .accessibilityIdentifier("delete-account")
            }
        }
        .navigationTitle("Delete account")
        .confirmationDialog("Delete your account and all your data?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Delete account", role: .destructive) { delete() }
                .accessibilityIdentifier("delete-account-confirm")
        }
    }

    private func delete() {
        deleting = true
        errorText = nil
        Task {
            do {
                try await app.deleteAccount()
            } catch let error as APIError where error.retryable {
                errorText = "We couldn't delete everything just now. Your account was kept. Please try again."
            } catch {
                errorText = app.message(for: error)
            }
            deleting = false
        }
    }
}

/// MedicationList.jsx: medications with dosage and schedule times.
struct MedicationView: View {
    @EnvironmentObject var app: AppState
    @State private var editing: Row?
    @State private var name = ""
    @State private var dosage = ""
    @State private var times = "08:00"
    @State private var active = true
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        Form {
            Section(editing == nil ? "Add medication" : "Edit medication") {
                TextField("Name", text: $name)
                TextField("Dosage (e.g. 500 mg)", text: $dosage)
                TextField("Times (HH:MM, comma separated)", text: $times)
                Toggle("Active", isOn: $active)
            }
            FormActions(isEditing: editing != nil, saving: saving, errorText: errorText, save: save, cancel: reset)
            RecentRowsSection(
                title: "Your medication", entity: .medication, sort: "name", limit: 100,
                label: { row in joinParts(row.string("name"), row.bool("is_active") == false ? "inactive" : nil) },
                detail: { row in
                    joinParts(row.string("dosage"), row.array("schedule_times").compactMap(\.stringValue).joined(separator: ", "))
                },
                onSelect: { row in
                    editing = row
                    name = row.string("name") ?? ""
                    dosage = row.string("dosage") ?? ""
                    times = row.array("schedule_times").compactMap(\.stringValue).joined(separator: ", ")
                    active = row.bool("is_active") ?? true
                })
        }
        .navigationTitle("Medication")
    }

    private func reset() {
        editing = nil
        name = ""
        dosage = ""
        times = "08:00"
        active = true
    }

    private func save() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorText = "Enter the medication name."
            return
        }
        let schedule = times.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { SleepMath.minutes($0) != nil }
        let fields: [String: JSONValue] = [
            "name": .string(name),
            "dosage": .string(dosage),
            "schedule_times": .array(schedule.map { .string($0) }),
            "is_active": .bool(active),
        ]
        saving = true
        errorText = nil
        Task {
            do {
                try await app.save(.medication, editing: editing, fields)
                reset()
            } catch {
                errorText = app.message(for: error)
            }
            saving = false
        }
    }
}
