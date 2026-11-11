import SwiftUI

/// Port of ProfileSetup.jsx: used on first run and from More > Profile.
struct ProfileView: View {
    @EnvironmentObject private var app: AppState
    var firstRun = false

    @State private var diabetesType = "type2"
    @State private var cgmDevice = "none"
    @State private var targetMin = "70"
    @State private var targetMax = "140"
    @State private var dietaryPreference = "omnivore"
    @State private var activityLevel = "moderately_active"
    @State private var gender = "prefer_not_to_say"
    @State private var age = ""
    @State private var weight = ""
    @State private var height = ""
    @State private var wakeTime = "07:00"
    @State private var sleepTime = "22:30"
    @State private var allergies = ""
    @State private var healthConditions = ""
    @State private var weeklyBudget = ""
    @State private var dailyRoutine = ""
    @State private var saving = false
    @State private var errorText: String?
    @State private var saved = false

    static let diabetesTypes = [("type1", "Type 1"), ("type2", "Type 2"), ("prediabetes", "Prediabetes"),
                                ("gestational", "Gestational")]
    static let cgmDevices = [("none", "None / Manual"), ("libre2", "Freestyle Libre 2"), ("libre3", "Freestyle Libre 3"),
                             ("dexcom_g6", "Dexcom G6"), ("dexcom_g7", "Dexcom G7"),
                             ("medtronic", "Medtronic Guardian"), ("other", "Other")]
    static let diets = [("omnivore", "Omnivore"), ("vegetarian", "Vegetarian"),
                        ("indian_vegetarian", "Indian Vegetarian"), ("vegan", "Vegan"),
                        ("pescetarian", "Pescetarian"), ("keto", "Keto"), ("mediterranean", "Mediterranean")]
    static let activityLevels = [("sedentary", "Sedentary"), ("lightly_active", "Lightly Active"),
                                 ("moderately_active", "Moderately Active"), ("very_active", "Very Active")]
    static let genders = [("male", "Male"), ("female", "Female"), ("other", "Other"),
                          ("prefer_not_to_say", "Prefer not to say")]

    var body: some View {
        Form {
            Section("Diabetes") {
                picker("Diabetes type", $diabetesType, ProfileView.diabetesTypes)
                picker("CGM device", $cgmDevice, ProfileView.cgmDevices)
                TextField("Target minimum (mg/dL)", text: $targetMin).keyboardType(.numberPad)
                TextField("Target maximum (mg/dL)", text: $targetMax).keyboardType(.numberPad)
            }
            Section("Lifestyle") {
                picker("Diet", $dietaryPreference, ProfileView.diets)
                picker("Activity level", $activityLevel, ProfileView.activityLevels)
                TextField("Wake time (HH:MM)", text: $wakeTime)
                TextField("Sleep time (HH:MM)", text: $sleepTime)
                TextField("Weekly food budget (\(Locale.current.currency?.identifier ?? "USD"))", text: $weeklyBudget)
                    .keyboardType(.decimalPad)
                TextField("Describe your typical day", text: $dailyRoutine, axis: .vertical)
            }
            Section("About you") {
                picker("Gender", $gender, ProfileView.genders)
                TextField("Age", text: $age).keyboardType(.numberPad)
                TextField("Weight (kg)", text: $weight).keyboardType(.decimalPad)
                TextField("Height (cm)", text: $height).keyboardType(.decimalPad)
            }
            Section("Health") {
                TextField("Allergies (comma separated)", text: $allergies)
                TextField("Other health conditions (comma separated)", text: $healthConditions)
            }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
            Section {
                SaveButton(title: firstRun ? "Save and continue" : "Save profile", saving: saving) { save() }
                    .accessibilityIdentifier("profile-save")
                if saved { Text("Saved").foregroundStyle(.secondary) }
            }
        }
        .navigationTitle(firstRun ? "Set up your profile" : "Profile")
        .onAppear(perform: load)
    }

    private func picker(_ title: String, _ selection: Binding<String>, _ options: [(String, String)]) -> some View {
        Picker(title, selection: selection) {
            ForEach(0..<options.count, id: \.self) { index in
                Text(options[index].1).tag(options[index].0)
            }
        }
    }

    private static func list(_ text: String) -> JSONValue {
        .array(text.split(separator: ",").map { .string($0.trimmingCharacters(in: .whitespaces)) }
            .filter { !$0.isBlank })
    }

    private static func joined(_ values: [JSONValue]) -> String {
        values.compactMap(\.stringValue).joined(separator: ", ")
    }

    private func load() {
        guard let profile = app.profile else { return }
        diabetesType = profile.string("diabetes_type") ?? diabetesType
        cgmDevice = profile.string("cgm_device") ?? cgmDevice
        targetMin = Num.text(profile.double("target_glucose_min") ?? 70)
        targetMax = Num.text(profile.double("target_glucose_max") ?? 140)
        dietaryPreference = profile.string("dietary_preference") ?? dietaryPreference
        activityLevel = profile.string("activity_level") ?? activityLevel
        gender = profile.string("gender") ?? gender
        age = Num.text(profile.double("age"))
        weight = Num.text(profile.double("weight"))
        height = Num.text(profile.double("height"))
        wakeTime = profile.string("wake_time") ?? wakeTime
        sleepTime = profile.string("sleep_time") ?? sleepTime
        allergies = ProfileView.joined(profile.array("allergies"))
        healthConditions = ProfileView.joined(profile.array("health_conditions"))
        weeklyBudget = Num.text(profile.double("weekly_food_budget"))
        dailyRoutine = profile.string("daily_routine") ?? ""
    }

    private func save() {
        saving = true
        errorText = nil
        saved = false
        let fields: [String: JSONValue] = [
            "diabetes_type": .string(diabetesType),
            "cgm_device": .string(cgmDevice),
            "target_glucose_min": Num.value(targetMin),
            "target_glucose_max": Num.value(targetMax),
            "dietary_preference": .string(dietaryPreference),
            "activity_level": .string(activityLevel),
            "gender": .string(gender),
            "age": Num.value(age),
            "weight": Num.value(weight),
            "height": Num.value(height),
            "wake_time": .string(String(wakeTime.prefix(5))),
            "sleep_time": .string(String(sleepTime.prefix(5))),
            "allergies": ProfileView.list(allergies),
            "health_conditions": ProfileView.list(healthConditions),
            "weekly_food_budget": Num.value(weeklyBudget),
            "daily_routine": .string(dailyRoutine),
        ]
        Task {
            do {
                try await app.saveProfile(fields)
                saved = true
            } catch {
                errorText = app.message(for: error)
            }
            saving = false
        }
    }
}
