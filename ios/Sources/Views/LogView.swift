import SwiftUI

/// Log tab: glucose, food, workout, journal, stress and sleep.
struct LogView: View {
    var body: some View {
        List {
            NavigationLink { GlucoseEntryView() } label: { Label("Glucose", systemImage: "drop") }
            NavigationLink { FoodLogView() } label: { Label("Food", systemImage: "fork.knife") }
            NavigationLink { WorkoutLogView() } label: { Label("Workout", systemImage: "figure.walk") }
            NavigationLink { JournalView() } label: { Label("Journal", systemImage: "book") }
            NavigationLink { StressLogView() } label: { Label("Stress", systemImage: "brain.head.profile") }
            NavigationLink { SleepLogView() } label: { Label("Sleep", systemImage: "moon") }
        }
        .navigationTitle("Log")
    }
}

// MARK: - Glucose (GlucoseEntryForm.jsx)

struct GlucoseEntryView: View {
    @EnvironmentObject private var app: AppState
    @State private var editing: Row?
    @State private var reading = ""
    @State private var when = Date()
    @State private var context = "random"
    @State private var trend = "stable"
    @State private var notes = ""
    @State private var saving = false
    @State private var errorText: String?

    static let contexts = [("fasting", "Fasting"), ("pre_meal", "Before Meal"), ("post_meal", "After Meal"),
                           ("before_exercise", "Before Exercise"), ("after_exercise", "After Exercise"),
                           ("bedtime", "Bedtime"), ("random", "Random")]
    static let trends = [("rising_fast", "Rising Fast ↑↑"), ("rising", "Rising ↑"), ("stable", "Stable →"),
                         ("falling", "Falling ↓"), ("falling_fast", "Falling Fast ↓↓")]

    var body: some View {
        Form {
            Section(editing == nil ? "New reading" : "Edit reading") {
                TextField("Glucose (mg/dL)", text: $reading)
                    .keyboardType(.decimalPad)
                    .accessibilityIdentifier("glucose-value")
                DatePicker("Time", selection: $when)
                OptionPicker("Context", $context, GlucoseEntryView.contexts)
                OptionPicker("Trend", $trend, GlucoseEntryView.trends)
                TextField("Notes", text: $notes, axis: .vertical)
            }
            FormActions(isEditing: editing != nil, saving: saving, errorText: errorText, save: save, cancel: reset)
            RecentRowsSection(
                title: "Recent readings", entity: .glucoseReading, sort: "-date", limit: 30,
                label: { "\(Num.text($0.double("reading"))) mg/dL" },
                detail: { row in
                    [row.string("date"), row.string("reading_time"),
                     OptionPicker.label(row.string("context"), in: GlucoseEntryView.contexts),
                     row.string("source_device") == "apple_health" ? "Apple Health" : nil]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                },
                onSelect: fill)
        }
        .navigationTitle("Glucose")
    }

    private func fill(_ row: Row) {
        editing = row
        reading = Num.text(row.double("reading"))
        when = DateText.readingDate(row) ?? Date()
        context = row.string("context") ?? "random"
        trend = row.string("trend") ?? "stable"
        notes = row.string("notes") ?? ""
    }

    private func reset() {
        editing = nil
        reading = ""
        when = Date()
        context = "random"
        trend = "stable"
        notes = ""
    }

    private func save() {
        guard let value = Num.value(reading).doubleValue, value > 0 else {
            errorText = "Enter your glucose in mg/dL."
            return
        }
        var fields: [String: JSONValue] = [
            "reading": .number(value),
            "date": .string(DateText.day(when)),
            "reading_time": .string(DateText.time(when)),
            "date_time": .string(DateText.iso(when)),
            "context": .string(context),
            "trend": .string(trend),
            "notes": .string(notes),
        ]
        if editing == nil { fields["source_device"] = .string("manual") }
        saving = true
        errorText = nil
        Task {
            do {
                try await app.save(.glucoseReading, editing: editing, fields)
                reset()
            } catch {
                errorText = app.message(for: error)
            }
            saving = false
        }
    }
}

// MARK: - Food (QuickFoodLog.jsx, with food-photo and food-nutrition)

struct FoodLogView: View {
    @EnvironmentObject private var app: AppState
    @State private var editing: Row?
    @State private var mealName = ""
    @State private var mealType = "lunch"
    @State private var details = ""
    @State private var calories = ""
    @State private var carbs = ""
    @State private var protein = ""
    @State private var fat = ""
    @State private var fiber = ""
    @State private var glycemicIndex = "medium"
    @State private var preGlucose = ""
    @State private var postGlucose = ""
    @State private var fileKey: String?
    @State private var analyzing = false
    @State private var saving = false
    @State private var errorText: String?

    static let mealTypes = [("breakfast", "Breakfast"), ("morning_snack", "Morning Snack"), ("lunch", "Lunch"),
                            ("afternoon_snack", "Afternoon Snack"), ("dinner", "Dinner"),
                            ("evening_snack", "Evening Snack")]
    static let glycemic = [("low", "Low"), ("medium", "Medium"), ("high", "High")]

    var body: some View {
        Form {
            Section("Photo") {
                PhotoField(fileKey: $fileKey)
                Button {
                    analyzePhoto()
                } label: {
                    HStack { if analyzing { ProgressView() }; Text("Analyze photo") }
                }
                .disabled(fileKey == nil || analyzing)
                .accessibilityIdentifier("analyze-photo")
            }
            Section(editing == nil ? "What did you eat?" : "Edit meal") {
                TextField("Food name", text: $mealName)
                Button("Estimate nutrition") { estimate() }
                    .disabled(mealName.trimmingCharacters(in: .whitespaces).isEmpty || analyzing)
                OptionPicker("Meal", $mealType, FoodLogView.mealTypes)
                TextField("Description", text: $details, axis: .vertical)
                TextField("Calories", text: $calories).keyboardType(.decimalPad)
                TextField("Carbs (g)", text: $carbs).keyboardType(.decimalPad)
                TextField("Protein (g)", text: $protein).keyboardType(.decimalPad)
                TextField("Fat (g)", text: $fat).keyboardType(.decimalPad)
                TextField("Fiber (g)", text: $fiber).keyboardType(.decimalPad)
                OptionPicker("Glycemic index", $glycemicIndex, FoodLogView.glycemic)
                TextField("Glucose before (mg/dL)", text: $preGlucose).keyboardType(.decimalPad)
                TextField("Glucose after (mg/dL)", text: $postGlucose).keyboardType(.decimalPad)
            }
            FormActions(isEditing: editing != nil, saving: saving, errorText: errorText, save: save, cancel: reset)
            RecentRowsSection(
                title: "Logged meals", entity: .mealPlan, sort: "-date", limit: 20, filters: ["is_completed": "true"],
                label: { $0.string("meal_name") ?? "Meal" },
                detail: { row in
                    [row.string("date"), OptionPicker.label(row.string("meal_type"), in: FoodLogView.mealTypes),
                     row.double("calories").map { "\(Num.text($0)) kcal" }]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                },
                onSelect: fill)
        }
        .navigationTitle("Food")
    }

    private func apply(_ result: JSONValue) {
        if let name = result["food_name"]?.stringValue { mealName = name }
        if let text = result["description"]?.stringValue, !text.isEmpty { details = text }
        calories = Num.text(result["calories"]?.doubleValue)
        carbs = Num.text(result["carbs"]?.doubleValue)
        protein = Num.text(result["protein"]?.doubleValue)
        fat = Num.text(result["fat"]?.doubleValue)
        fiber = Num.text(result["fiber"]?.doubleValue)
        if let type = result["meal_type"]?.stringValue { mealType = type }
        if let index = result["glycemic_index"]?.stringValue { glycemicIndex = index }
    }

    private func analyzePhoto() {
        guard let fileKey else { return }
        app.requireAI {
            runAI("food-photo", ["file_keys": .array([.string(fileKey)])])
        }
    }

    private func estimate() {
        let description = String(mealName.trimmingCharacters(in: .whitespaces).prefix(500))
        app.requireAI {
            runAI("food-nutrition", ["description": .string(description)])
        }
    }

    private func runAI(_ task: String, _ body: [String: JSONValue]) {
        analyzing = true
        errorText = nil
        Task {
            do {
                apply(try await app.runAI(task, body))
            } catch {
                errorText = AIErrorText.message(error)
            }
            analyzing = false
        }
    }

    private func fill(_ row: Row) {
        editing = row
        mealName = row.string("meal_name") ?? ""
        mealType = row.string("meal_type") ?? "lunch"
        details = row.string("description") ?? ""
        calories = Num.text(row.double("calories"))
        carbs = Num.text(row.double("carbs"))
        protein = Num.text(row.double("protein"))
        fat = Num.text(row.double("fat"))
        fiber = Num.text(row.double("fiber"))
        glycemicIndex = row.string("glycemic_index") ?? "medium"
        preGlucose = Num.text(row.double("pre_meal_glucose"))
        postGlucose = Num.text(row.double("post_meal_glucose"))
        fileKey = row.string("image_file_key")
    }

    private func reset() {
        editing = nil
        mealName = ""
        details = ""
        calories = ""
        carbs = ""
        protein = ""
        fat = ""
        fiber = ""
        glycemicIndex = "medium"
        preGlucose = ""
        postGlucose = ""
        fileKey = nil
    }

    private func save() {
        guard !mealName.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorText = "Enter what you ate."
            return
        }
        var fields: [String: JSONValue] = [
            "meal_name": .string(mealName),
            "meal_type": .string(mealType),
            "description": .string(details),
            "calories": Num.value(calories),
            "carbs": Num.value(carbs),
            "protein": Num.value(protein),
            "fat": Num.value(fat),
            "fiber": Num.value(fiber),
            "glycemic_index": .string(glycemicIndex),
            "pre_meal_glucose": Num.value(preGlucose),
            "post_meal_glucose": Num.value(postGlucose),
            "is_completed": .bool(true),
        ]
        if let fileKey { fields["image_file_key"] = .string(fileKey) }
        if editing == nil {
            fields["date"] = .string(DateText.day())
            fields["scheduled_time"] = .string(DateText.time())
        }
        saving = true
        errorText = nil
        Task {
            do {
                try await app.save(.mealPlan, editing: editing, fields)
                reset()
            } catch {
                errorText = app.message(for: error)
            }
            saving = false
        }
    }
}

// MARK: - Workout (QuickWorkoutLog.jsx, with workout-estimate)

struct WorkoutLogView: View {
    @EnvironmentObject private var app: AppState
    @State private var editing: Row?
    @State private var exerciseType = "walking"
    @State private var name = ""
    @State private var duration = "30"
    @State private var calories = ""
    @State private var preGlucose = ""
    @State private var postGlucose = ""
    @State private var howFelt = "good"
    @State private var estimating = false
    @State private var saving = false
    @State private var errorText: String?

    static let types = [("walking", "Walking"), ("jogging", "Jogging"), ("running", "Running"),
                        ("cycling", "Cycling"), ("swimming", "Swimming"), ("yoga", "Yoga"), ("pilates", "Pilates"),
                        ("strength_training", "Strength Training"), ("weight_lifting", "Weight Lifting"),
                        ("gym_workout", "Gym Workout"), ("hiit", "HIIT"), ("stretching", "Stretching"),
                        ("dance", "Dance"), ("aerobics", "Aerobics"), ("tennis", "Tennis"),
                        ("badminton", "Badminton"), ("basketball", "Basketball"), ("football", "Football"),
                        ("golf", "Golf"), ("rowing", "Rowing"), ("elliptical", "Elliptical"),
                        ("stair_climbing", "Stair Climbing"), ("boxing", "Boxing"),
                        ("martial_arts", "Martial Arts"), ("other", "Other")]
    static let feelings = [("great", "Great 💪"), ("good", "Good 👍"), ("okay", "Okay 😐"), ("tired", "Tired 😓"),
                           ("unwell", "Unwell 🤒")]

    var body: some View {
        Form {
            Section(editing == nil ? "New workout" : "Edit workout") {
                TextField("Describe it (e.g. 5 km evening run)", text: $name)
                Button {
                    estimate()
                } label: {
                    HStack { if estimating { ProgressView() }; Text("Estimate from description") }
                }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || estimating)
                OptionPicker("Type", $exerciseType, WorkoutLogView.types)
                TextField("Duration (minutes)", text: $duration).keyboardType(.numberPad)
                TextField("Calories burned", text: $calories).keyboardType(.decimalPad)
                TextField("Glucose before (mg/dL)", text: $preGlucose).keyboardType(.decimalPad)
                TextField("Glucose after (mg/dL)", text: $postGlucose).keyboardType(.decimalPad)
                OptionPicker("How did you feel?", $howFelt, WorkoutLogView.feelings)
            }
            FormActions(isEditing: editing != nil, saving: saving, errorText: errorText, save: save, cancel: reset)
            RecentRowsSection(
                title: "Recent workouts", entity: .exerciseLog, sort: "-date", limit: 20,
                label: { $0.string("exercise_name") ?? "Workout" },
                detail: { row in
                    [row.string("date"), row.double("duration_minutes").map { "\(Num.text($0)) min" },
                     row.double("calories_burned").map { "\(Num.text($0)) kcal" }]
                        .compactMap { $0 }.joined(separator: " · ")
                },
                onSelect: fill)
        }
        .navigationTitle("Workout")
    }

    private func estimate() {
        let description = String(name.trimmingCharacters(in: .whitespaces).prefix(500))
        app.requireAI {
            estimating = true
            errorText = nil
            Task {
                do {
                    let result = try await app.runAI("workout-estimate", ["description": .string(description)])
                    if let type = result["exercise_type"]?.stringValue { exerciseType = type }
                    duration = Num.text(result["duration_minutes"]?.doubleValue)
                    calories = Num.text(result["calories_burned"]?.doubleValue)
                } catch {
                    errorText = AIErrorText.message(error)
                }
                estimating = false
            }
        }
    }

    private func fill(_ row: Row) {
        editing = row
        name = row.string("exercise_name") ?? ""
        exerciseType = row.string("exercise_type") ?? "other"
        duration = Num.text(row.double("duration_minutes"))
        calories = Num.text(row.double("calories_burned"))
        preGlucose = Num.text(row.double("pre_exercise_glucose"))
        postGlucose = Num.text(row.double("post_exercise_glucose"))
        howFelt = row.string("how_felt") ?? "good"
    }

    private func reset() {
        editing = nil
        name = ""
        duration = "30"
        calories = ""
        preGlucose = ""
        postGlucose = ""
        howFelt = "good"
    }

    private func save() {
        let label = name.trimmingCharacters(in: .whitespaces).isEmpty
            ? OptionPicker.label(exerciseType, in: WorkoutLogView.types) : name
        var fields: [String: JSONValue] = [
            "exercise_name": .string(label),
            "exercise_type": .string(exerciseType),
            "duration_minutes": Num.value(duration),
            "actual_duration": Num.value(duration),
            "calories_burned": Num.value(calories),
            "pre_exercise_glucose": Num.value(preGlucose),
            "post_exercise_glucose": Num.value(postGlucose),
            "how_felt": .string(howFelt),
            "status": .string("completed"),
        ]
        if editing == nil {
            fields["date"] = .string(DateText.day())
            fields["date_time"] = .string(DateText.iso())
        }
        saving = true
        errorText = nil
        Task {
            do {
                try await app.save(.exerciseLog, editing: editing, fields)
                reset()
            } catch {
                errorText = app.message(for: error)
            }
            saving = false
        }
    }
}

// MARK: - Journal (DailyJournal.jsx, with journal-summary)

struct JournalView: View {
    @EnvironmentObject private var app: AppState
    @State private var text = ""
    @State private var fileKey: String?

    var body: some View {
        Form {
            Section("How was your day?") {
                TextField("Meals, activity, how you felt…", text: $text, axis: .vertical)
                    .lineLimit(5...12)
                PhotoField(fileKey: $fileKey)
            }
            Section {
                AICardView(title: "Journal summary", systemImage: "text.badge.star", task: "journal-summary",
                           buttonTitle: "Summarize", request: {
                               var body: [String: JSONValue] = ["text": .string(String(text.prefix(4000)))]
                               if let fileKey { body["file_keys"] = .array([.string(fileKey)]) }
                               return body
                           })
            }
        }
        .navigationTitle("Journal")
    }
}

// MARK: - Stress (DailyStressLogger.jsx)

struct StressLogView: View {
    @EnvironmentObject private var app: AppState
    @State private var editing: Row?
    @State private var level = 3
    @State private var notes = ""
    @State private var saving = false
    @State private var errorText: String?

    static let levels = [(1, "😊 Very Low"), (2, "🙂 Low"), (3, "😐 Moderate"), (4, "😟 High"), (5, "😰 Very High")]

    var body: some View {
        Form {
            Section(editing == nil ? "How stressed are you?" : "Edit stress log") {
                Picker("Stress level", selection: $level) {
                    ForEach(StressLogView.levels, id: \.0) { item in
                        Text(item.1).tag(item.0)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
                TextField("Notes", text: $notes, axis: .vertical)
            }
            FormActions(isEditing: editing != nil, saving: saving, errorText: errorText, save: save, cancel: reset)
            RecentRowsSection(
                title: "Recent", entity: .stressLog, sort: "-date", limit: 20,
                label: { row in StressLogView.levels.first(where: { $0.0 == row.int("stress_level") })?.1 ?? "Stress" },
                detail: { row in [row.string("date"), row.string("notes")].compactMap { $0 }.joined(separator: " · ") },
                onSelect: { row in
                    editing = row
                    level = row.int("stress_level") ?? 3
                    notes = row.string("notes") ?? ""
                })
        }
        .navigationTitle("Stress")
    }

    private func reset() {
        editing = nil
        level = 3
        notes = ""
    }

    private func save() {
        var fields: [String: JSONValue] = ["stress_level": .number(Double(level)), "notes": .string(notes)]
        if editing == nil { fields["date"] = .string(DateText.day()) }
        saving = true
        errorText = nil
        Task {
            do {
                try await app.save(.stressLog, editing: editing, fields)
                reset()
            } catch {
                errorText = app.message(for: error)
            }
            saving = false
        }
    }
}

// MARK: - Sleep (SleepLogger.jsx; also More > Sleep history)

struct SleepLogView: View {
    @EnvironmentObject private var app: AppState
    @State private var editing: Row?
    @State private var bedtime = "22:30"
    @State private var wakeTime = "06:30"
    @State private var quality = "good"
    @State private var interruptions = 0
    @State private var morningGlucose = ""
    @State private var bedtimeGlucose = ""
    @State private var notes = ""
    @State private var saving = false
    @State private var errorText: String?

    static let qualities = [("excellent", "😴 Excellent"), ("good", "🙂 Good"), ("fair", "😐 Fair"), ("poor", "😫 Poor")]

    var body: some View {
        Form {
            Section(editing == nil ? "Last night" : "Edit sleep") {
                TextField("Bedtime (HH:MM)", text: $bedtime)
                TextField("Wake time (HH:MM)", text: $wakeTime)
                if let hours = SleepMath.hours(bedtime: bedtime, wakeTime: wakeTime) {
                    Text("Total: \(Num.text(hours)) hours").foregroundStyle(.secondary)
                }
                OptionPicker("Quality", $quality, SleepLogView.qualities)
                Stepper("Interruptions: \(interruptions)", value: $interruptions, in: 0...20)
                TextField("Morning glucose (mg/dL)", text: $morningGlucose).keyboardType(.decimalPad)
                TextField("Bedtime glucose (mg/dL)", text: $bedtimeGlucose).keyboardType(.decimalPad)
                TextField("Notes", text: $notes, axis: .vertical)
            }
            FormActions(isEditing: editing != nil, saving: saving, errorText: errorText, save: save, cancel: reset)
            RecentRowsSection(
                title: "Sleep history", entity: .sleepLog, sort: "-date", limit: 30,
                label: { row in
                    let hours = row.double("total_hours") ?? row.double("duration_minutes").map { $0 / 60 }
                    return hours.map { "\(Num.text($0)) hours" } ?? "Sleep"
                },
                detail: { row in
                    [row.string("date"), OptionPicker.label(row.string("quality"), in: SleepLogView.qualities),
                     row.string("source") == "fitbit" ? "Fitbit" : nil]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                },
                onSelect: fill)
        }
        .navigationTitle("Sleep")
    }

    private func fill(_ row: Row) {
        editing = row
        bedtime = row.string("bedtime") ?? bedtime
        wakeTime = row.string("wake_time") ?? wakeTime
        quality = row.string("quality") ?? "good"
        interruptions = row.int("interruptions") ?? 0
        morningGlucose = Num.text(row.double("morning_glucose"))
        bedtimeGlucose = Num.text(row.double("bedtime_glucose"))
        notes = row.string("notes") ?? ""
    }

    private func reset() {
        editing = nil
        quality = "good"
        interruptions = 0
        morningGlucose = ""
        bedtimeGlucose = ""
        notes = ""
    }

    private func save() {
        guard let hours = SleepMath.hours(bedtime: bedtime, wakeTime: wakeTime) else {
            errorText = "Enter bedtime and wake time as HH:MM."
            return
        }
        var fields: [String: JSONValue] = [
            "bedtime": .string(bedtime),
            "wake_time": .string(wakeTime),
            "total_hours": .number(hours),
            "duration_minutes": .number((hours * 60).rounded()),
            "quality": .string(quality),
            "interruptions": .number(Double(interruptions)),
            "morning_glucose": Num.value(morningGlucose),
            "bedtime_glucose": Num.value(bedtimeGlucose),
            "notes": .string(notes),
        ]
        if editing == nil {
            fields["date"] = .string(DateText.day())
            fields["source"] = .string("manual")
        }
        saving = true
        errorText = nil
        Task {
            do {
                try await app.save(.sleepLog, editing: editing, fields)
                reset()
            } catch {
                errorText = app.message(for: error)
            }
            saving = false
        }
    }
}
