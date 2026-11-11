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

    /// Readings from the last 24 hours, for the sparkline on the wide glucose tile.
    private var last24Points: [GlucosePoint] {
        let cutoff = Date().addingTimeInterval(-86_400)
        return readings.compactMap { row in
            guard let date = DateText.readingDate(row), date >= cutoff, let value = row.double("reading") else { return nil }
            return GlucosePoint(id: row.id, date: date, value: value)
        }
        .sorted { $0.date < $1.date }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
        if let first = app.me?.fullName?.split(separator: " ").first { return "\(part), \(first)" }
        return part
    }

    private var initials: String {
        let name = app.me?.fullName ?? app.me?.email ?? "?"
        return name.split(separator: " ").prefix(2).compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let errorText {
                    ErrorBanner(message: errorText) { Task { await load() } }
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                        .font(Bento.label(14, relativeTo: .subheadline))
                        .foregroundStyle(.secondary)
                    Text(greeting).font(Bento.display(26))
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        NavigationLink { GlucoseEntryView() } label: {
                            BentoPill(title: "Log glucose", systemImage: "drop.fill", filled: true)
                        }
                        .accessibilityIdentifier("today-log-glucose")
                        NavigationLink { FoodLogView() } label: { BentoPill(title: "Log meal", systemImage: "fork.knife") }
                            .accessibilityIdentifier("today-log-meal")
                        NavigationLink { WorkoutLogView() } label: {
                            BentoPill(title: "Workout", systemImage: "figure.walk")
                        }
                        .accessibilityIdentifier("today-log-workout")
                    }
                    .buttonStyle(BentoPressStyle())
                }
                TrendBannerView()
                if let latest, let action = GlucoseAction.evaluate(reading: latest.double("reading"),
                                                                   trend: latest.string("trend"),
                                                                   targetMin: app.targetMin, targetMax: app.targetMax) {
                    GlucoseActionCardView(action: action, reading: latest.double("reading") ?? 0)
                }
                bentoGrid
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Text(initials)
                    .font(Bento.label(13).weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(LinearGradient(colors: [Bento.primary, Bento.accent],
                                                             startPoint: .topLeading, endPoint: .bottomTrailing)))
                    .accessibilityLabel("Signed in as \(app.me?.fullName ?? app.me?.email ?? "you")")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { detail = .upcoming } label: { Image(systemName: "bell") }
                    .accessibilityLabel("Upcoming reminders")
            }
        }
        .sheet(item: $detail) { tile in
            TileDetailView(title: tile.title) { detailContent(tile) }
                .presentationDetents([.large])
        }
        .refreshable {
            await app.syncHealth()
            await load()
        }
        .task(id: app.dataVersion) { await load() }
    }

    // MARK: Bento grid

    enum Tile: String, Identifiable {
        case glucose, range, meal, sleep, steps, upcoming
        var id: String { rawValue }
        var title: String {
            switch self {
            case .glucose: return "Today's glucose"
            case .range: return "Time in range"
            case .meal: return "Next meal"
            case .sleep: return "Sleep"
            case .steps: return "Steps"
            case .upcoming: return "Upcoming"
            }
        }
    }

    @State private var detail: Tile?

    private var timeInRange: Int? {
        let values = todayPoints.map(\.value)
        guard !values.isEmpty else { return nil }
        let inRange = values.filter { $0 >= app.targetMin && $0 <= app.targetMax }.count
        return Int((Double(inRange) / Double(values.count) * 100).rounded())
    }

    private var nextMeal: Row? {
        meals.filter { $0.bool("is_completed") != true }
            .sorted { ($0.string("scheduled_time") ?? "99") < ($1.string("scheduled_time") ?? "99") }
            .first
    }

    private var lastSleep: Row? { sleepLogs.first }

    private var sleepText: String {
        guard let row = lastSleep else { return "–" }
        if let minutes = row.double("duration_minutes") {
            return "\(Int(minutes) / 60)h \(Int(minutes) % 60)m"
        }
        if let hours = row.double("total_hours") { return "\(Num.text(hours))h" }
        return "–"
    }

    private var stepsToday: Int? { activity.first(where: { $0.string("date") == today })?.int("steps") }

    private var bentoGrid: some View {
        VStack(spacing: 12) {
            tileButton(.glucose, index: 0) {
                VStack(alignment: .leading, spacing: 8) {
                    tileLabel("Glucose now", systemImage: "drop.fill", color: Bento.primary)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(latest?.double("reading").map { Num.text($0) } ?? "–").font(Bento.number(40))
                        Text("mg/dL").font(Bento.label()).foregroundStyle(.secondary)
                    }
                    GlucoseSparkline(points: last24Points, targetMin: app.targetMin, targetMax: app.targetMax)
                        .frame(height: 56)
                }
            }
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 12) {
                    tileButton(.range, index: 1) {
                        squareTile("In range", systemImage: "target", color: Bento.accent,
                                   value: timeInRange.map { "\($0)%" } ?? "–", unit: "today")
                    }
                    tileButton(.meal, index: 3) {
                        VStack(alignment: .leading, spacing: 8) {
                            tileLabel("Next meal", systemImage: "fork.knife", color: Bento.primary)
                            Text(nextMeal?.string("meal_name") ?? "No meal planned")
                                .font(Bento.display(18, relativeTo: .headline))
                                .multilineTextAlignment(.leading)
                                .lineLimit(3)
                            if let time = nextMeal?.string("scheduled_time") {
                                Text(time).font(Bento.label()).foregroundStyle(.secondary).monospacedDigit()
                            }
                            if let calories = nextMeal?.double("calories") {
                                Text("\(Num.text(calories)) kcal").font(Bento.label()).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 24)
                            Text("\(meals.filter { $0.bool("is_completed") == true }.count)/\(meals.count) eaten")
                                .font(Bento.label()).foregroundStyle(.secondary)
                        }
                        .frame(minHeight: 170, alignment: .topLeading)
                    }
                }
                VStack(spacing: 12) {
                    tileButton(.sleep, index: 2) {
                        squareTile("Sleep", systemImage: "moon.fill", color: Bento.primary, value: sleepText,
                                   unit: lastSleep?.string("quality") ?? "last night")
                    }
                    tileButton(.steps, index: 4) {
                        squareTile("Steps", systemImage: "figure.walk", color: Bento.accent,
                                   value: stepsToday.map { $0.formatted() } ?? "–", unit: "today")
                    }
                    tileButton(.upcoming, index: 5) {
                        squareTile("Upcoming", systemImage: "bell.fill", color: Bento.primary,
                                   value: "\(RemindersView(meals: meals, exercises: exercises, medications: medications).items.count)",
                                   unit: "later today")
                    }
                }
            }
        }
    }

    private func tileButton<Content: View>(_ tile: Tile, index: Int,
                                           @ViewBuilder content: () -> Content) -> some View {
        Button { detail = tile } label: {
            content()
                .foregroundStyle(Bento.text)
                .bentoTile()
        }
        .buttonStyle(BentoPressStyle())
        .bentoRise(index)
        .accessibilityIdentifier("tile-\(tile.rawValue)")
    }

    private func tileLabel(_ title: String, systemImage: String, color: Color) -> some View {
        Label(title, systemImage: systemImage)
            .font(Bento.label(13).weight(.semibold))
            .foregroundStyle(color)
    }

    private func squareTile(_ title: String, systemImage: String, color: Color, value: String, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            tileLabel(title, systemImage: systemImage, color: color)
            Text(value).font(Bento.number(28)).lineLimit(1).minimumScaleFactor(0.6)
            Text(unit).font(Bento.label(12)).foregroundStyle(.secondary)
        }
        .frame(minHeight: 82, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func detailContent(_ tile: Tile) -> some View {
        switch tile {
        case .glucose, .range:
            GlucoseChartView(points: todayPoints, targetMin: app.targetMin, targetMax: app.targetMax)
                .bentoTile()
            QuickStatsView(points: todayPoints, meals: meals, targetMin: app.targetMin, targetMax: app.targetMax)
                .bentoTile()
        case .meal:
            if meals.isEmpty {
                Text("No meals planned for today. Create a plan in the Plans tab.").foregroundStyle(.secondary).bentoTile()
            }
            ForEach(meals) { meal in
                VStack(alignment: .leading, spacing: 4) {
                    Text(meal.string("meal_name") ?? "Meal").font(Bento.display(17, relativeTo: .headline))
                    Text(joinParts(meal.string("meal_type"), meal.string("scheduled_time"),
                                   meal.double("calories").map { "\(Num.text($0)) kcal" }))
                        .font(Bento.label()).foregroundStyle(.secondary)
                    if meal.bool("is_completed") == true {
                        Label("Eaten", systemImage: "checkmark.circle.fill").font(Bento.label()).foregroundStyle(Bento.accent)
                    }
                }
                .bentoTile()
            }
        case .sleep:
            if sleepLogs.isEmpty {
                Text("No sleep logged yet. Add it in the Log tab.").foregroundStyle(.secondary).bentoTile()
            }
            ForEach(sleepLogs.prefix(7)) { row in
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.string("date") ?? "").font(Bento.display(17, relativeTo: .headline))
                    Text(joinParts(row.double("duration_minutes").map { "\(Int($0) / 60)h \(Int($0) % 60)m" },
                                   row.string("quality")))
                        .font(Bento.label()).foregroundStyle(.secondary)
                }
                .bentoTile()
            }
        case .steps:
            if activity.isEmpty {
                Text("No activity yet. Connect Fitbit in Profile > Devices.").foregroundStyle(.secondary).bentoTile()
            }
            ForEach(activity.prefix(7)) { row in
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.string("date") ?? "").font(Bento.display(17, relativeTo: .headline))
                    Text(joinParts(row.int("steps").map { "\($0.formatted()) steps" },
                                   row.double("calories").map { "\(Num.text($0)) kcal" }))
                        .font(Bento.label()).foregroundStyle(.secondary)
                }
                .bentoTile()
            }
        case .upcoming:
            VStack(alignment: .leading, spacing: 10) {
                RemindersView(meals: meals, exercises: exercises, medications: medications)
            }
            .bentoTile()
        }
    }

    @State private var sleepLogs: [Row] = []
    @State private var activity: [Row] = []

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
        // Sleep and steps tiles are optional extras: a failure here leaves them empty instead of blocking the screen.
        sleepLogs = (try? await app.entities.list(.sleepLog, sort: "-date", limit: 14)) ?? []
        activity = (try? await app.entities.list(.activityData, sort: "-date", limit: 14)) ?? []
    }
}

/// A 24-hour sparkline over the target band for the wide glucose tile.
struct GlucoseSparkline: View {
    let points: [GlucosePoint]
    let targetMin: Double
    let targetMax: Double

    var body: some View {
        if points.count < 2 {
            Text(points.isEmpty ? "No readings in the last 24 hours." : "One reading in the last 24 hours.")
                .font(Bento.label())
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            let end = Date()
            Chart {
                RectangleMark(xStart: .value("Start", end.addingTimeInterval(-86_400)), xEnd: .value("End", end),
                              yStart: .value("Target min", targetMin), yEnd: .value("Target max", targetMax))
                    .foregroundStyle(Bento.accent.opacity(0.12))
                ForEach(points) { point in
                    LineMark(x: .value("Time", point.date), y: .value("mg/dL", point.value))
                        .foregroundStyle(Bento.primary)
                        .interpolationMethod(.catmullRom)
                }
            }
            .chartXScale(domain: end.addingTimeInterval(-86_400)...end)
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .accessibilityLabel("Glucose over the last 24 hours, \(points.count) readings")
        }
    }
}

/// A tile expanded into a full-height detail card.
struct TileDetailView<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) { content() }
                    .padding(16)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .bentoScreen()
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
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Image(systemName: result["is_positive"]?.boolValue == true ? "hand.thumbsup.fill" : "lightbulb.fill")
                            .foregroundStyle(Bento.accent)
                        Text("Today's trend").font(Bento.display(17, relativeTo: .headline))
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
                .bentoTile()
                .bentoRise(0)
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
