import Foundation

/// Date strings in the formats the API stores (date "yyyy-MM-dd", reading_time "HH:mm"), in the device time zone.
enum DateText {
    private static func formatter(_ format: String, timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        return formatter
    }

    static func day(_ date: Date = Date(), timeZone: TimeZone = .current) -> String {
        formatter("yyyy-MM-dd", timeZone: timeZone).string(from: date)
    }

    static func time(_ date: Date = Date(), timeZone: TimeZone = .current) -> String {
        formatter("HH:mm", timeZone: timeZone).string(from: date)
    }

    static func iso(_ date: Date = Date(), timeZone: TimeZone = .current) -> String {
        GlucoseImportSample.isoString(date, timeZone: timeZone)
    }

    static func parseDay(_ text: String?) -> Date? {
        guard let text else { return nil }
        return formatter("yyyy-MM-dd", timeZone: .current).date(from: String(text.prefix(10)))
    }

    /// Parses API timestamps with or without fractional seconds.
    static func parseISO(_ text: String?) -> Date? {
        guard let text else { return nil }
        let plain = ISO8601DateFormatter()
        if let date = plain.date(from: text) { return date }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        // Naive timestamps (no offset) are UTC on this API.
        return plain.date(from: text + "Z") ?? fractional.date(from: text + "Z")
    }

    /// When a glucose row was taken: date_time, else date + reading_time, else created_at.
    static func readingDate(_ row: Row) -> Date? {
        if let date = parseISO(row.string("date_time")) { return date }
        if let day = row.string("date"), let time = row.string("reading_time") {
            return formatter("yyyy-MM-dd HH:mm", timeZone: .current).date(from: "\(day.prefix(10)) \(time.prefix(5))")
        }
        return parseISO(row.string("created_at"))
    }
}
