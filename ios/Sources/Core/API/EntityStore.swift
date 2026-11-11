import Foundation

/// The 10 user-scoped tables behind /api/v1/entities/{entity}.
enum Entity: String, CaseIterable {
    case userProfile = "UserProfile"
    case glucoseReading = "GlucoseReading"
    case mealPlan = "MealPlan"
    case exercisePlan = "ExercisePlan"
    case exerciseLog = "ExerciseLog"
    case sleepLog = "SleepLog"
    case activityData = "ActivityData"
    case stressLog = "StressLog"
    case privacyConsent = "PrivacyConsent"
    case medication = "Medication"

    /// Typed columns per entity (same list as src/api/entity-fields.json, checked by api/tests/test_ios_contract.py).
    /// Anything else a screen writes goes into `extra`, the same rule as the web row adapter.
    var fields: [String] {
        switch self {
        case .userProfile:
            return ["activity_level", "age", "allergies", "daily_routine", "diabetes_type", "dietary_preference",
                    "extra", "gender", "height", "sleep_time", "target_glucose_max", "target_glucose_min",
                    "wake_time", "weight"]
        case .glucoseReading:
            return ["context", "date", "date_time", "external_id", "extra", "reading", "reading_time",
                    "source_device", "trend"]
        case .mealPlan:
            return ["calories", "carbs", "date", "description", "extra", "fat", "fiber", "glycemic_index",
                    "image_file_key", "ingredients", "is_completed", "meal_name", "meal_type", "notes",
                    "post_meal_glucose", "pre_meal_glucose", "protein", "scheduled_time"]
        case .exercisePlan:
            return ["calories_burned", "date", "duration_minutes", "exercise_name", "exercise_type", "extra",
                    "intensity", "is_completed", "precautions", "scheduled_days", "scheduled_time"]
        case .exerciseLog:
            return ["actual_duration", "calories_burned", "date", "date_time", "duration_minutes", "exercise_name",
                    "extra", "post_exercise_glucose", "pre_exercise_glucose"]
        case .sleepLog:
            return ["bedtime", "date", "duration_minutes", "external_id", "extra", "quality", "sleep_end_time",
                    "sleep_start_time", "source", "total_hours", "wake_time"]
        case .activityData:
            return ["active_minutes", "calories", "date", "extra", "resting_heart_rate", "source", "steps"]
        case .stressLog:
            return ["date", "extra", "notes", "stress_level"]
        case .privacyConsent:
            return ["cgm", "consented_at", "email", "extra", "location", "wearables"]
        case .medication:
            return ["dosage", "extra", "is_active", "name", "schedule_times"]
        }
    }

    /// Integer columns: the server rejects 12.0 for an int field, so these are sent as whole numbers.
    var integerFields: Set<String> {
        ["age", "target_glucose_min", "target_glucose_max", "duration_minutes", "actual_duration", "stress_level",
         "steps", "active_minutes", "resting_heart_rate"]
    }
}

/// One entity row as the screens see it: typed columns and `extra` keys flattened into one dictionary.
struct Row: Identifiable, Equatable {
    var fields: [String: JSONValue]

    var id: String { fields["id"]?.stringValue ?? "" }

    func string(_ key: String) -> String? {
        guard let value = fields[key], !value.isNull else { return nil }
        return value.stringValue
    }

    func double(_ key: String) -> Double? { fields[key]?.doubleValue }
    func int(_ key: String) -> Int? { double(key).map { Int($0.rounded()) } }
    func bool(_ key: String) -> Bool? { fields[key]?.boolValue }
    func array(_ key: String) -> [JSONValue] { fields[key]?.arrayValue ?? [] }

    subscript(key: String) -> JSONValue? {
        get { fields[key] }
        set { fields[key] = newValue }
    }
}

/// Moves fields between the flat screen dictionary and the API shape (typed columns plus `extra`).
enum RowAdapter {
    static let serverOwned: Set<String> = ["id", "user_id", "created_at", "updated_at", "created_date", "base44_id",
                                           "libre_connected", "fitbit_connected", "dexcom_connected"]

    /// API row -> screen row: extra keys first, typed columns win; created_date mirrors created_at like the web.
    static func fromWire(_ value: JSONValue) -> Row {
        var flat: [String: JSONValue] = [:]
        let object = value.objectValue ?? [:]
        if let extra = object["extra"]?.objectValue {
            for (key, item) in extra { flat[key] = item }
        }
        for (key, item) in object where key != "extra" { flat[key] = item }
        if flat["created_date"] == nil, let created = object["created_at"] { flat["created_date"] = created }
        return Row(fields: flat)
    }

    /// Screen fields -> request body. Unknown keys go into extra, merged over `existingExtra` so a PATCH never
    /// drops extra keys written by the other app.
    static func toWire(_ data: [String: JSONValue], entity: Entity,
                       existingExtra: [String: JSONValue] = [:]) -> [String: JSONValue] {
        var out: [String: JSONValue] = [:]
        var extra = existingExtra
        var touchedExtra = false
        if let explicit = data["extra"]?.objectValue {
            for (key, item) in explicit { extra[key] = item }
            touchedExtra = true
        }
        let known = Set(entity.fields)
        for (key, item) in data where key != "extra" && !serverOwned.contains(key) {
            if known.contains(key) {
                if entity.integerFields.contains(key), let number = item.doubleValue {
                    out[key] = .number(number.rounded())
                } else {
                    out[key] = item
                }
            } else {
                extra[key] = item
                touchedExtra = true
            }
        }
        if touchedExtra { out["extra"] = .object(extra) }
        return out
    }

    /// The extra keys of an existing row (to merge into on update).
    static func extraKeys(of row: Row, entity: Entity) -> [String: JSONValue] {
        let known = Set(entity.fields)
        return row.fields.filter { !known.contains($0.key) && !serverOwned.contains($0.key) }
    }
}

/// CRUD over /api/v1/entities/{entity} for the signed-in user.
final class EntityStore {
    let client: APIClient

    init(client: APIClient) { self.client = client }

    func list(_ entity: Entity, sort: String? = nil, limit: Int = 50, since: String? = nil,
              filters: [String: String] = [:]) async throws -> [Row] {
        var query: [URLQueryItem] = [URLQueryItem(name: "limit", value: String(min(limit, 500)))]
        if let sort { query.append(URLQueryItem(name: "sort", value: sort == "-created_date" ? "-created_at" : sort)) }
        if let since { query.append(URLQueryItem(name: "since", value: since)) }
        for (key, value) in filters.sorted(by: { $0.key < $1.key }) { query.append(URLQueryItem(name: key, value: value)) }
        let json = try await client.json("GET", Endpoints.entities(entity.rawValue), query: query)
        return (json.arrayValue ?? []).map(RowAdapter.fromWire)
    }

    @discardableResult
    func create(_ entity: Entity, _ data: [String: JSONValue]) async throws -> Row {
        let body = JSONValue.object(RowAdapter.toWire(data, entity: entity))
        return RowAdapter.fromWire(try await client.json("POST", Endpoints.entities(entity.rawValue), body: body))
    }

    @discardableResult
    func update(_ entity: Entity, row: Row, _ data: [String: JSONValue]) async throws -> Row {
        let body = JSONValue.object(RowAdapter.toWire(data, entity: entity,
                                                      existingExtra: RowAdapter.extraKeys(of: row, entity: entity)))
        return RowAdapter.fromWire(try await client.json("PATCH", Endpoints.entity(entity.rawValue, id: row.id),
                                                         body: body))
    }

    func delete(_ entity: Entity, id: String) async throws {
        try await client.send("DELETE", Endpoints.entity(entity.rawValue, id: id))
    }
}
