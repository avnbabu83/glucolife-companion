import Foundation
import HealthKit

/// Reads blood glucose from Apple Health (read-only) and uploads new samples to POST /api/v1/glucose/import.
/// The anchor is stored per user and advanced only after every batch was accepted.
final class HealthKitGlucoseSync {
    enum SyncError: Error { case unavailable, consentRequired }

    static let backfillDays = 30

    private let store = HKHealthStore()
    private let client: APIClient
    private let defaults: UserDefaults
    private var observer: HKObserverQuery?
    private var running = false
    let userID: String

    init(client: APIClient, userID: String, defaults: UserDefaults = .standard) {
        self.client = client
        self.userID = userID
        self.defaults = defaults
    }

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }
    static var glucoseType: HKQuantityType { HKQuantityType(.bloodGlucose) }

    // MARK: Stored state (UserDefaults keys include the user id; removed on sign-out and deletion)

    static func anchorKey(_ userID: String) -> String { "healthkit.anchor.\(userID)" }
    static func connectedKey(_ userID: String) -> String { "healthkit.connected.\(userID)" }
    static func lastImportKey(_ userID: String) -> String { "healthkit.lastImport.\(userID)" }
    static func lastCountsKey(_ userID: String) -> String { "healthkit.lastCounts.\(userID)" }

    static func clearStoredState(userID: String, defaults: UserDefaults = .standard) {
        for key in [anchorKey(userID), connectedKey(userID), lastImportKey(userID), lastCountsKey(userID)] {
            defaults.removeObject(forKey: key)
        }
    }

    var isConnected: Bool { defaults.bool(forKey: HealthKitGlucoseSync.connectedKey(userID)) }
    var lastImport: Date? { defaults.object(forKey: HealthKitGlucoseSync.lastImportKey(userID)) as? Date }
    var lastCounts: (imported: Int, skipped: Int)? {
        guard let list = defaults.array(forKey: HealthKitGlucoseSync.lastCountsKey(userID)) as? [Int], list.count == 2
        else { return nil }
        return (list[0], list[1])
    }

    private func loadAnchor() -> HKQueryAnchor? {
        guard let data = defaults.data(forKey: HealthKitGlucoseSync.anchorKey(userID)) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private func saveAnchor(_ anchor: HKQueryAnchor?) {
        guard let anchor,
              let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
        else { return }
        defaults.set(data, forKey: HealthKitGlucoseSync.anchorKey(userID))
    }

    // MARK: Connect

    /// Shows Apple's permission sheet for reading blood glucose only, then imports the last 30 days.
    func connect() async throws -> GlucoseImportResult {
        guard HealthKitGlucoseSync.isAvailable else { throw SyncError.unavailable }
        try await store.requestAuthorization(toShare: [], read: [HealthKitGlucoseSync.glucoseType])
        defaults.set(true, forKey: HealthKitGlucoseSync.connectedKey(userID))
        startBackgroundDelivery()
        return try await sync()
    }

    func disconnect() {
        if let observer { store.stop(observer) }
        observer = nil
        store.disableBackgroundDelivery(for: HealthKitGlucoseSync.glucoseType) { _, _ in }
        HealthKitGlucoseSync.clearStoredState(userID: userID, defaults: defaults)
    }

    // MARK: Sync

    /// Runs the anchored query from the stored anchor (first run: last 30 days) and uploads in batches of 500.
    @discardableResult
    func sync() async throws -> GlucoseImportResult {
        guard isConnected, HealthKitGlucoseSync.isAvailable, !running else { return GlucoseImportResult() }
        running = true
        defer { running = false }
        let anchor = loadAnchor()
        let (samples, newAnchor) = try await fetch(after: anchor)
        let result: GlucoseImportResult
        do {
            result = try await GlucoseImportPlan.upload(samples) { batch in
                try await self.client.json("POST", Endpoints.glucoseImport, body: GlucoseImportPlan.body(for: batch))
            }
        } catch let error as APIError where error.status == 403 {
            throw SyncError.consentRequired
        }
        saveAnchor(newAnchor)
        defaults.set(Date(), forKey: HealthKitGlucoseSync.lastImportKey(userID))
        defaults.set([result.imported, result.skipped], forKey: HealthKitGlucoseSync.lastCountsKey(userID))
        return result
    }

    private func fetch(after anchor: HKQueryAnchor?) async throws -> ([GlucoseImportSample], HKQueryAnchor?) {
        let predicate: NSPredicate? = anchor == nil
            ? HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-Double(HealthKitGlucoseSync.backfillDays) * 86_400),
                                          end: nil, options: [])
            : nil
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(type: HealthKitGlucoseSync.glucoseType, predicate: predicate,
                                              anchor: anchor, limit: HKObjectQueryNoLimit) { _, added, _, newAnchor, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let unit = HKUnit(from: "mg/dL")
                let samples = (added ?? []).compactMap { $0 as? HKQuantitySample }.map { sample -> GlucoseImportSample in
                    let zoneName = sample.metadata?[HKMetadataKeyTimeZone] as? String
                    let zone = zoneName.flatMap { TimeZone(identifier: $0) } ?? TimeZone.current
                    return GlucoseImportSample.make(uuid: sample.uuid, mgdl: sample.quantity.doubleValue(for: unit),
                                                    date: sample.startDate, timeZone: zone,
                                                    sourceApp: sample.sourceRevision.source.bundleIdentifier)
                }
                continuation.resume(returning: (samples, newAnchor))
            }
            store.execute(query)
        }
    }

    // MARK: Background delivery

    /// Hourly background delivery: iOS wakes the app when new glucose samples arrive; the observer imports them
    /// and then calls HealthKit's completion handler.
    func startBackgroundDelivery() {
        guard isConnected, HealthKitGlucoseSync.isAvailable, observer == nil else { return }
        let query = HKObserverQuery(sampleType: HealthKitGlucoseSync.glucoseType, predicate: nil) { [weak self] _, completion, error in
            guard let self, error == nil else {
                completion()
                return
            }
            Task {
                _ = try? await self.sync()
                completion()
            }
        }
        observer = query
        store.execute(query)
        store.enableBackgroundDelivery(for: HealthKitGlucoseSync.glucoseType, frequency: .hourly) { _, _ in }
    }
}
