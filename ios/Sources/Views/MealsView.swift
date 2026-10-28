import SwiftUI

/// Meals tab: meal plan generator, planned meal cards, and the exercise plan with exercise cards.
struct MealsView: View {
    @EnvironmentObject var app: AppState
    @State private var meals: [Row] = []
    @State private var exercises: [Row] = []
    @State private var errorText: String?

    var body: some View {
        List {
            if let errorText { ErrorBanner(message: errorText) { Task { await load() } } }
            Section { MealPlanGeneratorView() }
            Section("Planned meals") {
                if meals.isEmpty { Text("No planned meals. Generate a plan above.").foregroundStyle(.secondary) }
                ForEach(meals) { meal in MealCardView(meal: meal) }
                    .onDelete { offsets in remove(offsets.map { meals[$0] }, entity: .mealPlan) }
            }
            Section { ExercisePlanGeneratorView() }
            Section("Exercise plan") {
                if exercises.isEmpty { Text("No exercise plan yet.").foregroundStyle(.secondary) }
                ForEach(exercises) { exercise in ExerciseCardView(exercise: exercise) }
                    .onDelete { offsets in remove(offsets.map { exercises[$0] }, entity: .exercisePlan) }
            }
        }
        .navigationTitle("Meals")
        .refreshable { await load() }
        .task(id: app.dataVersion) { await load() }
    }

    private func load() async {
        do {
            let today = DateText.day()
            meals = try await app.entities.list(.mealPlan, sort: "date", limit: 100, since: today)
                .filter { $0.bool("is_completed") != true || $0.string("date") == today }
                .sorted { ($0.string("date") ?? "", $0.string("scheduled_time") ?? "")
                    < ($1.string("date") ?? "", $1.string("scheduled_time") ?? "") }
            exercises = try await app.entities.list(.exercisePlan, sort: "-created_at", limit: 50)
            errorText = nil
        } catch {
            errorText = app.message(for: error)
        }
    }

    private func remove(_ rows: [Row], entity: Entity) {
        Task {
            for row in rows {
                do { try await app.delete(entity, row: row) } catch { errorText = app.message(for: error) }
            }
        }
    }
}

/// MealPlanGenerator.jsx: ai meal-plan with days and target calories; preview, then save as MealPlan rows.
struct MealPlanGeneratorView: View {
    @EnvironmentObject var app: AppState
    @State private var days = 3
    @State private var targetCalories = 1800
    @State private var preview: [JSONValue] = []
    @State private var insights: String?
    @State private var busy = false
    @State private var errorText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Meal Plan Generator", systemImage: "sparkles").font(.headline)
            Stepper("Days: \(days)", value: $days, in: 1...14)
            Stepper("Calories per day: \(targetCalories)", value: $targetCalories, in: 800...5000, step: 50)
            Button {
                app.requireAI { generate() }
            } label: {
                if busy { ProgressView() } else { Text(preview.isEmpty ? "Generate meal plan" : "Generate again") }
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy)
            .accessibilityIdentifier("ai-meal-plan")
            if let errorText { Text(errorText).font(.footnote).foregroundStyle(.red) }
            if !preview.isEmpty {
                if let insights { Text(insights).font(.footnote).foregroundStyle(.secondary) }
                ForEach(Array(preview.enumerated()), id: \.offset) { _, day in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Day \(day["day"]?.stringValue ?? "")").bold()
                        ForEach(Array((day["meals"]?.arrayValue ?? []).enumerated()), id: \.offset) { _, meal in
                            Text("\(meal["scheduled_time"]?.stringValue ?? "") \(meal["meal_name"]?.stringValue ?? "") · \(Num.text(meal["calories"]?.doubleValue)) kcal")
                                .font(.callout)
                        }
                    }
                }
                HStack {
                    Button("Save plan") { save() }.buttonStyle(.borderedProminent).disabled(busy)
                    Button("Discard", role: .cancel) { preview = [] }
                }
            }
        }
    }

    private func generate() {
        busy = true
        errorText = nil
        var body: [String: JSONValue] = ["days": .number(Double(days)), "targetCalories": .number(Double(targetCalories))]
        if let code = Locale.current.currency?.identifier, code.count == 3 { body["currency"] = .string(code.uppercased()) }
        Task {
            do {
                let result = try await app.runAI("meal-plan", body)
                preview = result["mealPlan"]?.arrayValue ?? []
                insights = result["insights"]?.stringValue
                if preview.isEmpty { errorText = "No meal plan was returned. Please try again." }
            } catch {
                errorText = AIErrorText.message(error)
            }
            busy = false
        }
    }

    private func save() {
        busy = true
        let plan = preview
        Task {
            do {
                for day in plan {
                    let offset = (day["day"]?.doubleValue).map { Int($0) - 1 } ?? 0
                    let date = DateText.day(Date().addingTimeInterval(Double(max(0, offset)) * 86_400))
                    for meal in day["meals"]?.arrayValue ?? [] {
                        var fields = meal.objectValue ?? [:]
                        fields["date"] = .string(date)
                        fields["is_completed"] = .bool(false)
                        try await app.entities.create(.mealPlan, fields)
                    }
                }
                preview = []
                app.dataVersion += 1
            } catch {
                errorText = app.message(for: error)
            }
            busy = false
        }
    }
}

/// MealCard.jsx: a planned meal with nutrition and 'Mark Complete'.
struct MealCardView: View {
    @EnvironmentObject var app: AppState
    let meal: Row
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(meal.string("meal_name") ?? "Meal").bold().strikethrough(meal.bool("is_completed") == true)
                Spacer()
                Text(joinParts(meal.string("date"), meal.string("scheduled_time"))).font(.caption).foregroundStyle(.secondary)
            }
            if let description = meal.string("description"), !description.isEmpty {
                Text(description).font(.caption).foregroundStyle(.secondary)
            }
            Text(joinParts(meal.double("calories").map { "\(Num.text($0)) kcal" },
                           meal.double("carbs").map { "\(Num.text($0))g carbs" },
                           meal.double("protein").map { "\(Num.text($0))g protein" },
                           meal.string("glycemic_index").map { "GI \($0)" }))
                .font(.caption2)
            Button(meal.bool("is_completed") == true ? "Completed" : "Mark Complete") {
                busy = true
                Task {
                    try? await app.save(.mealPlan, editing: meal, ["is_completed": .bool(meal.bool("is_completed") != true)])
                    busy = false
                }
            }
            .buttonStyle(.bordered)
            .disabled(busy)
        }
    }
}

/// Exercise plan generation (ai exercise-plan), saved as ExercisePlan rows.
struct ExercisePlanGeneratorView: View {
    @EnvironmentObject var app: AppState
    @State private var busy = false
    @State private var errorText: String?
    @State private var insights: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Exercise Plan", systemImage: "figure.run").font(.headline)
            Text("A weekly plan based on your profile and how exercise affects your glucose.")
                .font(.caption).foregroundStyle(.secondary)
            Button {
                app.requireAI { generate() }
            } label: {
                if busy { ProgressView() } else { Text("Generate exercise plan") }
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy)
            .accessibilityIdentifier("ai-exercise-plan")
            if let insights { Text(insights).font(.footnote).foregroundStyle(.secondary) }
            if let errorText { Text(errorText).font(.footnote).foregroundStyle(.red) }
        }
    }

    private func generate() {
        busy = true
        errorText = nil
        Task {
            do {
                let result = try await app.runAI("exercise-plan")
                for exercise in result["exercises"]?.arrayValue ?? [] {
                    try await app.entities.create(.exercisePlan, [
                        "exercise_name": exercise["name"] ?? .string("Exercise"),
                        "exercise_type": exercise["exercise_type"] ?? .null,
                        "duration_minutes": exercise["duration_minutes"] ?? .null,
                        "intensity": exercise["intensity"] ?? .null,
                        "scheduled_days": exercise["scheduled_days"] ?? .array([]),
                        "scheduled_time": exercise["scheduled_time"] ?? .null,
                        "calories_burned": exercise["calories_burned"] ?? .null,
                        "precautions": exercise["precautions"] ?? .null,
                        "date": .string(DateText.day()),
                        "is_completed": .bool(false),
                    ])
                }
                insights = result["insights"]?.stringValue
                app.dataVersion += 1
            } catch {
                errorText = AIErrorText.message(error)
            }
            busy = false
        }
    }
}

/// ExerciseCard.jsx: one planned exercise with 'Mark Complete'.
struct ExerciseCardView: View {
    @EnvironmentObject var app: AppState
    let exercise: Row
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(exercise.string("exercise_name") ?? "Exercise").bold()
                .strikethrough(exercise.bool("is_completed") == true)
            Text(joinParts(exercise.double("duration_minutes").map { "\(Num.text($0)) min" },
                           exercise.string("intensity"),
                           exercise.string("scheduled_time"),
                           exercise.array("scheduled_days").compactMap(\.stringValue).joined(separator: ", ")))
                .font(.caption).foregroundStyle(.secondary)
            if let precautions = exercise.string("precautions"), !precautions.isEmpty {
                Text(precautions).font(.caption2)
            }
            Button(exercise.bool("is_completed") == true ? "Completed" : "Mark Complete") {
                busy = true
                Task {
                    try? await app.save(.exercisePlan, editing: exercise,
                                        ["is_completed": .bool(exercise.bool("is_completed") != true)])
                    if exercise.bool("is_completed") != true {
                        try? await app.entities.create(.exerciseLog, [
                            "exercise_name": .string(exercise.string("exercise_name") ?? "Exercise"),
                            "duration_minutes": exercise["duration_minutes"] ?? .null,
                            "calories_burned": exercise["calories_burned"] ?? .null,
                            "date": .string(DateText.day()),
                            "date_time": .string(DateText.iso()),
                            "status": .string("completed"),
                        ])
                    }
                    busy = false
                }
            }
            .buttonStyle(.bordered)
            .disabled(busy)
        }
    }
}
