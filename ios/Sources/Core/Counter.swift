import Foundation

/// Logic lives in Core, in plain Swift, so the tests can check it without any screen.
struct Counter: Equatable {
    private(set) var value = 0
    let step: Int

    init(step: Int = 1) {
        self.step = max(1, step)
    }

    mutating func increment() { value += step }
    mutating func decrement() { value = max(0, value - step) }
    mutating func reset() { value = 0 }
}
