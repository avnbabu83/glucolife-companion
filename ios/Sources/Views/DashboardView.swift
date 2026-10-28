import Charts
import SwiftUI

struct GlucosePoint: Identifiable {
    let id: String
    let date: Date
    let value: Double
}

/// Dashboard tab: today's chart with the target band, quick stats, reminders, the action card and the daily trend.
struct DashboardView: View {
    @EnvironmentObject var app: AppState
    @State private var readings: [Row] = []
    @State private var meals: [Row] = []
    @State private var exercises: [Row] = []
    @State private var medications: [Row] = []
    @State private var errorText: String?

    private var today: String { DateText.day() }

    private var todayPoints: [GlucosePoint] {
        readings.filter { ($0.string("date") ?? "").hasPrefix(today) }
            .compactMap { row in
                guard let date = DateText.readingDate(row), let value = row.double("reading") else { return nil }
                return GlucosePoint(id: row.id, date: date, value: value)
            }
            .sorted { $0.date < $1.date }
    }

    private var latest: Row? {
        readings.max { (DateText.readingDate($0) ?? .distantPast) < (DateText.readingDate($1) ?? .distantPast) }
    }

    var body: some View {
        List {
            if let errorText {
                ErrorBanner(message: errorText) { Task { await load() } }
            }
            TrendBannerView()
            if let latest, let action = GlucoseAction.evaluate(reading: latest.double("reading"),
                                                               trend: latest.string("trend"),
                                                               targetMin: app.targetMin, targetMax: app.targetMax) {
                Section { GlucoseActionCardView(action: action, reading: latest.double("reading") ?? 0) }
            }
            Section("Today's glucose") {
                GlucoseChartView(points: todayPoints, targetMin: app.targetMin, targetMax: app.targetMax)
            }
            Section("Quick stats") {
                QuickStatsView(points: todayPoints, meals: meals, targetMin: app.targetMin, targetMax: app.targetMax)
            }
            Section("Upcoming") {
                RemindersView(meals: meals, exercises: exercises, medications: medications)
            }
        }
        .navigationTitle("Dashboard")
        .refreshable {
            await app.syncHealth()
            await load()
        }
        .task(id: app.dataVersion) { await load() }
    }

    private func load() async {
        do {
            let since = DateText.day(Date().addingTimeInterval(-7 * 86_400))
            readings = try await app.entities.list(.glucoseReading, sort: "-date", limit: 500, since: since)
            meals = try await app.entities.list(.mealPlan, sort: "-date", limit: 100, filters: ["date": today])
            exercises = try await app.entities.list(.exercisePlan, sort: "-date", limit: 50, filters: ["date": today])
            medications = try await app.entities.list(.medication, limit: 100)
            errorText = nil
        } catch {
            errorText = app.message(for: error)
        }
    }
}

/// GlucoseChart.jsx: a line over today's readings and the target band (default 70-140).
struct GlucoseChartView: View {
    let points: [GlucosePoint]
    let targetMin: Double
    let targetMax: Double

    var body: some View {
        let start = Calendar.current.startOfDay(for: Date())
        let end = start.addingTimeInterval(86_400)
        if points.isEmpty {
            Text("No readings today yet. Log one in the Log tab or connect a device.")
                .foregroundStyle(.secondary)
        } else {
            Chart {
                RectangleMark(xStart: .value("Start", start), xEnd: .value("End", end),
                              yStart: .value("Target min", targetMin), yEnd: .value("Target max", targetMax))
                    .foregroundStyle(Color.accentColor.opacity(0.15))
                ForEach(points) { point in
                    LineMark(x: .value("Time", point.date), y: .value("mg/dL", point.value))
                        .foregroundStyle(Color.accentColor)
                    PointMark(x: .value("Time", point.date), y: .value("mg/dL", point.value))
                        .foregroundStyle(point.value > targetMax || point.value < targetMin ? Color.red : Color.accentColor)
                }
            }
            .chartXScale(domain: start...end)
            .frame(height: 220)
            .accessibilityLabel("Glucose chart with \(points.count) readings today")
        }
    }
}

/// QuickStats.jsx: latest, average, time in range and meals today.
struct QuickStatsView: View {
    let points: [GlucosePoint]
    let meals: [Row]
    let targetMin: Double
    let targetMax: Double

    var body: some View {
        let values = points.map(\.value)
        let average = values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
        let inRange = values.isEmpty ? nil
            : Double(values.filter { $0 >= targetMin && $0 <= targetMax }.count) / Double(values.count) * 100
        let mealsDone = meals.filter { $0.bool("is_completed") == true }.count
        Grid(horizontalSpacing: 16, verticalSpacing: 12) {
            GridRow {
                stat("Latest", points.last.map { "\(Num.text($0.value))" } ?? "–", "mg/dL")
                stat("Average", average.map { "\(Int($0.rounded()))" } ?? "–", "mg/dL")
            }
            GridRow {
                stat("In range", inRange.map { "\(Int($0.rounded()))%" } ?? "–", "today")
                stat("Meals", "\(mealsDone)/\(meals.count)", "eaten")
            }
        }
    }

    private func stat(_ title: String, _ value: String, _ unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title2.bold())
            Text(unit).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// UpcomingReminders.jsx as an in-app list (no push): meals, exercise and medication later today.
struct RemindersView: View {
    let meals: [Row]
    let exercises: [Row]
    let medications: [Row]

    struct Item: Identifiable {
        let id: String
        let time: String
        let title: String
        let icon: String
    }

    var items: [Item] {
        let now = DateText.time()
        var list: [Item] = []
        for meal in meals where meal.bool("is_completed") != true {
            if let time = meal.string("scheduled_time"), time >= now {
                list.append(Item(id: "m\(meal.id)", time: time, title: meal.string("meal_name") ?? "Meal", icon: "fork.knife"))
            }
        }
        for exercise in exercises where exercise.bool("is_completed") != true {
            if let time = exercise.string("scheduled_time"), time >= now {
                list.append(Item(id: "e\(exercise.id)", time: time, title: exercise.string("exercise_name") ?? "Exercise",
                                 icon: "figure.walk"))
            }
        }
        for medication in medications where medication.bool("is_active") != false {
            for time in medication.array("schedule_times").compactMap(\.stringValue) where time >= now {
                list.append(Item(id: "d\(medication.id)\(time)", time: time,
                                 title: joinParts(medication.string("name"), medication.string("dosage")), icon: "pills"))
            }
        }
        return list.sorted { $0.time < $1.time }
    }

    var body: some View {
        let upcoming = items
        if upcoming.isEmpty {
            Text("Nothing else planned for today.").foregroundStyle(.secondary)
        } else {
            ForEach(upcoming) { item in
                Label {
                    HStack {
                        Text(item.title)
                        Spacer()
                        Text(item.time).foregroundStyle(.secondary).monospacedDigit()
                    }
                } icon: {
                    Image(systemName: item.icon)
                }
            }
        }
    }
}

/// GlucoseActionCard.jsx: what to do now, from the latest reading and trend.
struct GlucoseActionCardView: View {
    let action: GlucoseAction
    let reading: Double

    private var color: Color {
        switch action.severity {
        case .critical: return .red
        case .warning: return action.kind == .low ? .orange : .pink
        case .info: return .blue
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: action.kind == .low || action.kind == .falling ? "arrow.down.circle.fill"
                      : "arrow.up.circle.fill")
                Text(action.title).font(.headline)
                Spacer()
                Text("\(Num.text(reading)) mg/dL").font(.subheadline.bold())
            }
            Text(action.advice).font(.callout)
            ForEach(action.steps, id: \.label) { step in
                HStack(alignment: .top) {
                    Image(systemName: step.primary ? "checkmark.circle.fill" : "circle")
                    VStack(alignment: .leading) {
                        Text(step.label).bold()
                        Text(step.detail).font(.caption)
                    }
                }
            }
        }
        .padding(12)
        .foregroundStyle(.white)
        .background(color.gradient, in: RoundedRectangle(cornerRadius: 12))
        .listRowInsets(EdgeInsets())
        .accessibilityIdentifier("glucose-action-card")
    }
}

/// DailyGlucoseTrendNotification.jsx: the AI daily-trend card, fetched at most once per day (only after the user
/// has allowed AI processing).
struct TrendBannerView: View {
    @EnvironmentObject var app: AppState
    @State private var result: JSONValue?
    @State private var dismissed = false

    var body: some View {
        Group {
            if let result, !dismissed {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Image(systemName: result["is_positive"]?.boolValue == true ? "hand.thumbsup.fill" : "lightbulb.fill")
                            Text("Today's trend").font(.headline)
                            Spacer()
                            Button {
                                dismissed = true
                            } label: {
                                Image(systemName: "xmark")
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("Dismiss")
                        }
                        if let message = result["message"]?.stringValue { Text(message) }
                        if let tip = result["tip"]?.stringValue { Text(tip).font(.footnote).foregroundStyle(.secondary) }
                    }
                }
            }
        }
        .task { await loadOncePerDay() }
    }

    private func loadOncePerDay() async {
        let today = DateText.day()
        guard app.aiAllowed, UserDefaults.standard.string(forKey: AppState.trendCardDayKey) != today else { return }
        if let value = try? await app.runAI("daily-trend") {
            UserDefaults.standard.set(today, forKey: AppState.trendCardDayKey)
            result = value
        }
    }
}
