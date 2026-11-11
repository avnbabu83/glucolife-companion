import Foundation

/// Port of SleepLogger.jsx calculateHours: wake before bedtime means the next morning; one decimal.
enum SleepMath {
    static func minutes(_ hhmm: String) -> Int? {
        let parts = hhmm.split(separator: ":")
        guard parts.count >= 2, let hours = Int(parts[0]), let minutes = Int(parts[1]),
              (0..<24).contains(hours), (0..<60).contains(minutes) else { return nil }
        return hours * 60 + minutes
    }

    static func hours(bedtime: String, wakeTime: String) -> Double? {
        guard let bed = minutes(bedtime), var wake = minutes(wakeTime) else { return nil }
        if wake < bed { wake += 24 * 60 }
        return (Double(wake - bed) / 60 * 10).rounded() / 10
    }
}
