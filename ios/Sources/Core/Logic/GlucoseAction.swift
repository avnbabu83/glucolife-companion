import Foundation

/// Port of src/components/cgm/GlucoseActionCard.jsx: what to do about the latest reading.
struct GlucoseAction: Equatable {
    enum Severity: String { case critical, warning, info }
    enum Kind: String { case low, high, rising, falling }

    struct Step: Equatable {
        let label: String
        let detail: String
        let primary: Bool
    }

    let kind: Kind
    let severity: Severity
    let title: String
    let advice: String
    let steps: [Step]

    static func isRising(_ trend: String?) -> Bool { trend == "rising" || trend == "rising_fast" }
    static func isFalling(_ trend: String?) -> Bool { trend == "falling" || trend == "falling_fast" }

    /// Same thresholds as the web card: critical above max+50 or below min-20.
    static func evaluate(reading: Double?, trend: String?, targetMin: Double = 70,
                         targetMax: Double = 140) -> GlucoseAction? {
        guard let reading, reading > 0 else { return nil }
        let isHigh = reading > targetMax
        let isLow = reading < targetMin
        let rising = isRising(trend)
        let falling = isFalling(trend)
        let critical = reading > targetMax + 50 || reading < targetMin - 20

        if isLow || (reading < targetMin + 20 && falling) {
            return GlucoseAction(
                kind: .low, severity: critical ? .critical : .warning,
                title: critical ? "Low Glucose - Act Now" : "Glucose Trending Low",
                advice: falling
                    ? "Your glucose is falling. Have fast-acting carbs now and avoid exercise."
                    : "Your glucose is low. Have a quick snack and rest for 15 minutes.",
                steps: [
                    Step(label: "15g Fast Carbs", detail: "4 glucose tablets or 1/2 cup juice", primary: true),
                    Step(label: "Quick Snack", detail: "Crackers, fruit, or granola bar", primary: false),
                    Step(label: "Recheck in 15 min", detail: "Monitor your levels closely", primary: false),
                ])
        }
        if isHigh || (reading > targetMax - 20 && rising) {
            let minutes = activityMinutes(reading: reading, targetMax: targetMax)
            return GlucoseAction(
                kind: .high, severity: critical ? .critical : .warning,
                title: critical ? "High Glucose - Take Action" : "Glucose Trending High",
                advice: rising
                    ? "Your glucose is rising. A \(minutes)-minute walk can help bring it down."
                    : "Your glucose is elevated. Light activity and hydration can help.",
                steps: [
                    Step(label: "Walk for \(minutes) min", detail: "Light activity to lower glucose", primary: true),
                    Step(label: "Drink Water", detail: "Stay hydrated to help flush glucose", primary: false),
                    Step(label: "Check Medication", detail: "Ensure you took your meds on time", primary: false),
                ])
        }
        if rising {
            return GlucoseAction(
                kind: .rising, severity: .info, title: "Glucose Rising",
                advice: "Your glucose is going up. A short walk after eating helps.",
                steps: [
                    Step(label: "Stay Active", detail: "Take a 10-minute walk after your meal", primary: false),
                    Step(label: "Monitor", detail: "Keep an eye on the trend", primary: false),
                ])
        }
        if falling {
            return GlucoseAction(
                kind: .falling, severity: .info, title: "Glucose Falling",
                advice: "Your glucose is going down. Keep a snack nearby.",
                steps: [
                    Step(label: "Have a Snack Ready", detail: "In case it keeps dropping", primary: false),
                    Step(label: "Monitor", detail: "Keep an eye on the trend", primary: false),
                ])
        }
        return nil
    }

    /// Math.min(30, Math.max(10, Math.round(excess / 10) * 5)) from the web card (JS rounds .5 up).
    static func activityMinutes(reading: Double, targetMax: Double) -> Int {
        let excess = reading - targetMax
        let rounded = Int((excess / 10).rounded(.down) + ((excess / 10) - (excess / 10).rounded(.down) >= 0.5 ? 1 : 0))
        return min(30, max(10, rounded * 5))
    }
}
