import XCTest
@testable import iOSApp

final class CounterTests: XCTestCase {
    func testCountsUpAndDownByTheStep() {
        var counter = Counter(step: 2)
        counter.increment()
        counter.increment()
        counter.decrement()
        XCTAssertEqual(counter.value, 2)
    }

    func testNeverGoesBelowZero() {
        var counter = Counter()
        counter.decrement()
        XCTAssertEqual(counter.value, 0)
    }

    func testAStepBelowOneIsTreatedAsOne() {
        var counter = Counter(step: 0)
        counter.increment()
        XCTAssertEqual(counter.value, 1)
        counter.reset()
        XCTAssertEqual(counter.value, 0)
    }
}
