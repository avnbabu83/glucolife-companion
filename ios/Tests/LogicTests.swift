import HealthKit
import UIKit
import XCTest
@testable import iOSApp

final class GlucoseImportTests: XCTestCase {
    func testMmolPerLiterSamplesConvertToMgPerDeciliter() {
        let mmolPerLiter = HKUnit.moleUnit(with: .milli, molarMass: HKUnitMolarMassBloodGlucose).unitDivided(by: .liter())
        let quantity = HKQuantity(unit: mmolPerLiter, doubleValue: 5.5)
        let mgdl = quantity.doubleValue(for: HKUnit(from: "mg/dL"))
        XCTAssertEqual(mgdl, 99.09, accuracy: 0.1)

        let sample = GlucoseImportSample.make(uuid: UUID(), mgdl: mgdl, date: Date(), timeZone: .current, sourceApp: nil)
        XCTAssertEqual(sample.readingMgDl, 99.1, accuracy: 0.001)
    }

    func testDateTimeKeepsTheDeviceOffset() throws {
        let date = try XCTUnwrap(ISO8601DateFormatter().date(from: "2025-03-01T05:30:00Z"))
        let newYork = try XCTUnwrap(TimeZone(secondsFromGMT: -5 * 3600))
        let id = UUID()
        let sample = GlucoseImportSample.make(uuid: id, mgdl: 120, date: date, timeZone: newYork,
                                              sourceApp: "com.abbott.librelink")
        XCTAssertEqual(sample.dateTime, "2025-03-01T00:30:00-05:00")
        XCTAssertEqual(sample.json["external_id"]?.stringValue, id.uuidString)
        XCTAssertEqual(sample.json["source_app"]?.stringValue, "com.abbott.librelink")
        XCTAssertEqual(sample.json["reading_mg_dl"]?.doubleValue, 120)
    }

    func testBatchesOf500() {
        let sizes = GlucoseImportPlan.batches(Array(0..<1201)).map(\.count)
        XCTAssertEqual(sizes, [500, 500, 201])
        XCTAssertEqual(GlucoseImportPlan.batches([Int]()).count, 0)
    }

    func testUploadSumsCountsAndStopsOnTheFirstFailedBatch() async throws {
        let samples = (0..<1201).map {
            GlucoseImportSample(externalID: "id\($0)", readingMgDl: 100, dateTime: "2025-03-01T00:00:00Z", sourceApp: nil)
        }
        let ok = try await GlucoseImportPlan.upload(samples) { batch in
            .object(["received": .number(Double(batch.count)), "imported": .number(Double(batch.count - 1)),
                     "duplicates": .number(1), "rejected": .number(0)])
        }
        XCTAssertEqual(ok, GlucoseImportResult(received: 1201, imported: 1198, duplicates: 3, rejected: 0))

        var calls = 0
        do {
            _ = try await GlucoseImportPlan.upload(samples) { _ in
                calls += 1
                if calls == 2 { throw APIError(status: 503, message: "busy", retryable: true) }
                return .object([:])
            }
            XCTFail("expected the failed batch to throw, so the anchor is not advanced")
        } catch let error as APIError {
            XCTAssertEqual(error.status, 503)
        }
        XCTAssertEqual(calls, 2, "no batch is sent after a failure")
        XCTAssertEqual(GlucoseImportPlan.body(for: Array(samples.prefix(2)))["samples"]?.arrayValue?.count, 2)
    }
}

final class RowAdapterTests: XCTestCase {
    func testReadFlattensExtraAndAddsCreatedDate() {
        let row = RowAdapter.fromWire(.object([
            "id": .string("r1"), "reading": .number(120), "created_at": .string("2025-01-01T00:00:00Z"),
            "extra": .object(["notes": .string("after lunch"), "reading": .number(1)]),
        ]))
        XCTAssertEqual(row.double("reading"), 120, "typed columns win over extra")
        XCTAssertEqual(row.string("notes"), "after lunch")
        XCTAssertEqual(row.string("created_date"), "2025-01-01T00:00:00Z")
    }

    func testWriteMovesUnknownKeysIntoExtraAndKeepsExistingExtra() {
        let body = RowAdapter.toWire([
            "reading": .number(120), "notes": .string("n"), "id": .string("x"), "created_date": .string("d"),
        ], entity: .glucoseReading, existingExtra: ["source_app": .string("com.example")])
        XCTAssertEqual(body["reading"], .number(120))
        XCTAssertNil(body["id"])
        XCTAssertNil(body["created_date"])
        XCTAssertEqual(body["extra"], .object(["notes": .string("n"), "source_app": .string("com.example")]))
    }

    func testAIPermissionIsWrittenIntoPrivacyConsentExtra() {
        let consent = RowAdapter.fromWire(.object([
            "id": .string("c1"), "wearables": .bool(true), "extra": .object(["legacy": .string("keep")]),
        ]))
        let body = RowAdapter.toWire(["ai_processing": .bool(true)], entity: .privacyConsent,
                                     existingExtra: RowAdapter.extraKeys(of: consent, entity: .privacyConsent))
        XCTAssertEqual(body["extra"], .object(["ai_processing": .bool(true), "legacy": .string("keep")]))
        XCTAssertNil(body["wearables"], "a partial update only sends what changed")
    }

    func testIntegerColumnsAreSentAsWholeNumbers() {
        let body = RowAdapter.toWire(["duration_minutes": .number(29.6)], entity: .exerciseLog)
        XCTAssertEqual(body["duration_minutes"], .number(30))
    }
}

final class GlucoseActionTests: XCTestCase {
    func testThresholdsMatchTheWebCard() {
        XCTAssertNil(GlucoseAction.evaluate(reading: 100, trend: "stable"))
        XCTAssertEqual(GlucoseAction.evaluate(reading: 141, trend: "stable")?.severity, .warning)
        XCTAssertEqual(GlucoseAction.evaluate(reading: 190, trend: "stable")?.severity, .warning)
        XCTAssertEqual(GlucoseAction.evaluate(reading: 191, trend: "stable")?.severity, .critical)
        XCTAssertEqual(GlucoseAction.evaluate(reading: 69, trend: "stable")?.kind, .low)
        XCTAssertEqual(GlucoseAction.evaluate(reading: 50, trend: "stable")?.severity, .warning)
        XCTAssertEqual(GlucoseAction.evaluate(reading: 49, trend: "stable")?.severity, .critical)
        XCTAssertEqual(GlucoseAction.evaluate(reading: 89, trend: "falling")?.kind, .low, "near the minimum and falling")
        XCTAssertEqual(GlucoseAction.evaluate(reading: 90, trend: "falling")?.kind, .falling)
        XCTAssertEqual(GlucoseAction.evaluate(reading: 121, trend: "rising_fast")?.kind, .high)
        XCTAssertEqual(GlucoseAction.evaluate(reading: 120, trend: "rising")?.kind, .rising)
    }

    func testWalkMinutesFollowTheWebFormula() {
        XCTAssertEqual(GlucoseAction.activityMinutes(reading: 145, targetMax: 140), 10)
        XCTAssertEqual(GlucoseAction.activityMinutes(reading: 165, targetMax: 140), 15)
        XCTAssertEqual(GlucoseAction.activityMinutes(reading: 300, targetMax: 140), 30)
    }
}

final class SmallLogicTests: XCTestCase {
    func testPKCEChallengeMatchesRFC7636() {
        XCTAssertEqual(AuthCrypto.codeChallenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
                       "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        XCTAssertEqual(AuthCrypto.randomHex().count, 64)
    }

    func testOAuthCallbackChecksState() throws {
        let good = try XCTUnwrap(URL(string: "com.diabeteasy.app:/fitbit/callback?code=abc&state=s1"))
        XCTAssertEqual(AuthCrypto.authorizationCode(from: good, expectedState: "s1"), "abc")
        XCTAssertNil(AuthCrypto.authorizationCode(from: good, expectedState: "other"))
        let denied = try XCTUnwrap(URL(string: "com.diabeteasy.app:/fitbit/callback?error=access_denied&state=s1"))
        XCTAssertNil(AuthCrypto.authorizationCode(from: denied, expectedState: "s1"))
    }

    func testSleepHoursCrossMidnight() {
        XCTAssertEqual(SleepMath.hours(bedtime: "22:30", wakeTime: "06:30"), 8.0)
        XCTAssertEqual(SleepMath.hours(bedtime: "01:00", wakeTime: "07:20"), 6.3)
        XCTAssertNil(SleepMath.hours(bedtime: "25:00", wakeTime: "07:00"))
    }
}

final class ImageResizerTests: XCTestCase {
    func testOutputIsAJPEGWithLongestSideAtMost1568() throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let big = UIGraphicsImageRenderer(size: CGSize(width: 4032, height: 3024), format: format).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4032, height: 3024))
        }
        let jpeg = try XCTUnwrap(ImageResizer.jpeg(from: big))
        XCTAssertEqual(Array(jpeg.prefix(3)), [0xFF, 0xD8, 0xFF])
        let decoded = try XCTUnwrap(UIImage(data: jpeg))
        let pixels = CGSize(width: decoded.size.width * decoded.scale, height: decoded.size.height * decoded.scale)
        XCTAssertEqual(max(pixels.width, pixels.height), 1568)
        XCTAssertEqual(ImageResizer.targetSize(for: CGSize(width: 800, height: 600)), CGSize(width: 800, height: 600))
    }
}
