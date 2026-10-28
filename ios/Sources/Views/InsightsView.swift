import SwiftUI

/// Insights tab: AI recommendations, glucose trend analysis, nutrition comparison and the routine analyzer.
struct InsightsView: View {
    @State private var trendDays = 14
    @State private var comparisonDate = Date()

    var body: some View {
        List {
            Section {
                AICardView(title: "AI Recommendations", systemImage: "lightbulb", task: "recommendations",
                           buttonTitle: "Get recommendations")
            }
            Section {
                Stepper("Analyze last \(trendDays) days", value: $trendDays, in: 7...90, step: 7)
                AICardView(title: "Glucose Trend Analysis", systemImage: "chart.line.uptrend.xyaxis",
                           task: "glucose-trends", buttonTitle: "Analyze trends",
                           request: { ["days": .number(Double(trendDays))] })
            }
            Section {
                DatePicker("Day", selection: $comparisonDate, in: ...Date(), displayedComponents: .date)
                AICardView(title: "Nutrition Comparison", systemImage: "chart.bar", task: "nutrition-comparison",
                           buttonTitle: "Compare plan and actual",
                           request: { ["date": .string(DateText.day(comparisonDate))] })
            }
            Section { LifestyleRoutineAnalyzerView() }
        }
        .navigationTitle("Insights")
    }
}

/// LifestyleRoutineAnalyzer.jsx: saves the routine on the profile, runs routine-analysis and can merge the
/// suggestions into MealPlan and ExercisePlan rows.
struct LifestyleRoutineAnalyzerView: View {
    @EnvironmentObject var app: AppState
    @State private var routine = ""
    @State private var result: JSONValue?
    @State private var busy = false
    @State private var merged = false
    @State private var errorText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Lifestyle Routine Analyzer", systemImage: "calendar.day.timeline.left").font(.headline)
            TextField("Describe a typical day: wake-up, work, commute, meals, exercise, sleep…",
                      text: $routine, axis: .vertical)
                .lineLimit(4...10)
                .textFieldStyle(.roundedBorder)
            Button {
                app.requireAI { analyze() }
            } label: {
                if busy { ProgressView() } else { Text("Analyze my routine") }
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || routine.trimmingCharacters(in: .whitespaces).isEmpty)
            .accessibilityIdentifier("ai-routine-analysis")
            if let errorText { Text(errorText).font(.footnote).foregroundStyle(.red) }
            if let result {
                JSONResultView(value: result)
                Button(merged ? "Merged into your plans" : "Merge into my plans") { merge(result) }
                    .buttonStyle(.bordered)
                    .disabled(busy || merged)
            }
        }
        .onAppear {
            if routine.isEmpty { routine = app.profile?.string("daily_routine") ?? "" }
        }
    }

    private func analyze() {
        busy = true
        errorText = nil
        merged = false
        let text = String(routine.prefix(4000))
        Task {
            do {
                if let profile = app.profile {
                    app.profile = try await app.entities.update(.userProfile, row: profile, ["daily_routine": .string(text)])
                }
                result = try await app.runAI("routine-analysis", ["routine": .string(text)])
            } catch {
                errorText = AIErrorText.message(error)
            }
            busy = false
        }
    }

    /// Same mapping as the web: meal recommendations become MealPlan rows, exercise opportunities ExercisePlan rows.
    static func rows(from result: JSONValue, date: String) -> (meals: [[String: JSONValue]], exercises: [[String: JSONValue]]) {
        let meals = (result["meal_recommendations"]?.arrayValue ?? []).map { item -> [String: JSONValue] in
            let ideas = (item["meal_ideas"]?.arrayValue ?? []).compactMap(\.stringValue)
            return [
                "meal_name": .string(ideas.first ?? item["meal"]?.stringValue ?? "Meal"),
                "meal_type": .string((item["meal"]?.stringValue ?? "meal").lowercased().replacingOccurrences(of: " ", with: "_")),
                "description": .string(item["reasoning"]?.stringValue ?? ""),
                "scheduled_time": .string(String((item["suggested_time"]?.stringValue ?? "").prefix(5))),
                "date": .string(date),
                "is_completed": .bool(false),
            ]
        }
        let exercises = (result["exercise_opportunities"]?.arrayValue ?? []).map { item -> [String: JSONValue] in
            let digits = (item["duration"]?.stringValue ?? "").filter(\.isNumber)
            return [
                "exercise_name": .string(item["activity"]?.stringValue ?? "Exercise"),
                "duration_minutes": Int(digits).map { .number(Double($0)) } ?? .null,
                "precautions": .string(item["how_to_fit"]?.stringValue ?? ""),
                "scheduled_time": .string(String((item["when"]?.stringValue ?? "").prefix(5))),
                "date": .string(date),
                "is_completed": .bool(false),
            ]
        }
        return (meals, exercises)
    }

    private func merge(_ result: JSONValue) {
        busy = true
        let planned = LifestyleRoutineAnalyzerView.rows(from: result, date: DateText.day())
        Task {
            do {
                for meal in planned.meals { try await app.entities.create(.mealPlan, meal) }
                for exercise in planned.exercises { try await app.entities.create(.exercisePlan, exercise) }
                merged = true
                app.dataVersion += 1
            } catch {
                errorText = app.message(for: error)
            }
            busy = false
        }
    }
}
