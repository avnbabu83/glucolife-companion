import Foundation

/// One Apple Health reading in the shape POST /api/v1/glucose/import expects.
struct GlucoseImportSample: Equatable {
    let externalID: String
    let readingMgDl: Double
    let dateTime: String
    let sourceApp: String?

    var json: JSONValue {
        var object: [String: JSONValue] = [
            "external_id": .string(externalID),
            "reading_mg_dl": .number(readingMgDl),
            "date_time": .string(dateTime),
        ]
        if let sourceApp, !sourceApp.isEmpty { object["source_app"] = .string(String(sourceApp.prefix(255))) }
        return .object(object)
    }

    /// Maps a HealthKit sample (already converted to mg/dL) with the time zone it was recorded in.
    static func make(uuid: UUID, mgdl: Double, date: Date, timeZone: TimeZone, sourceApp: String?) -> GlucoseImportSample {
        GlucoseImportSample(externalID: uuid.uuidString, readingMgDl: (mgdl * 10).rounded() / 10,
                            dateTime: isoString(date, timeZone: timeZone), sourceApp: sourceApp)
    }

    /// ISO 8601 with the UTC offset of `timeZone`, e.g. 2025-03-01T00:30:00-05:00.
    static func isoString(_ date: Date, timeZone: TimeZone) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = timeZone
        return formatter.string(from: date)
    }
}

struct GlucoseImportResult: Equatable {
    var received = 0
    var imported = 0
    var duplicates = 0
    var rejected = 0

    mutating func add(_ json: JSONValue) {
        received += json["received"]?.doubleValue.map { Int($0) } ?? 0
        imported += json["imported"]?.doubleValue.map { Int($0) } ?? 0
        duplicates += json["duplicates"]?.doubleValue.map { Int($0) } ?? 0
        rejected += json["rejected"]?.doubleValue.map { Int($0) } ?? 0
    }

    var skipped: Int { duplicates + rejected }
}

enum GlucoseImportPlan {
    static let batchSize = 500

    static func batches<T>(_ items: [T], size: Int = batchSize) -> [[T]] {
        guard size > 0 else { return [items] }
        return stride(from: 0, to: items.count, by: size).map { Array(items[$0..<min($0 + size, items.count)]) }
    }

    /// Sends every batch in order. Returns the summed counts; throws on the first failed batch, in which case the
    /// caller must not advance the HealthKit anchor (the next run re-sends; duplicates are no-ops on the server).
    static func upload(_ samples: [GlucoseImportSample],
                       send: ([GlucoseImportSample]) async throws -> JSONValue) async throws -> GlucoseImportResult {
        var total = GlucoseImportResult()
        for batch in batches(samples) {
            total.add(try await send(batch))
        }
        return total
    }

    static func body(for batch: [GlucoseImportSample]) -> JSONValue {
        .object(["samples": .array(batch.map(\.json))])
    }
}
