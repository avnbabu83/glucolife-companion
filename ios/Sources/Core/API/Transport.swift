import Foundation

/// Sends one HTTP request. The app uses URLSessionTransport; tests and UI tests use stubs.
protocol HTTPTransport: AnyObject {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// Ephemeral session without a URL cache, so no API response (health data) is written to disk.
final class URLSessionTransport: HTTPTransport {
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 120
        session = URLSession(configuration: config)
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError(status: 0, code: "invalid_response", message: "The server sent an invalid response.")
        }
        return (data, http)
    }
}

/// Canned answers for UI tests (launch argument -uiTestStub). Never used in a normal launch.
final class StubTransport: HTTPTransport {
    private let lock = NSLock()
    private var consent: String?
    private var profile: String?

    init(firstRun: Bool) {
        if !firstRun {
            consent = #"{"id":"c1","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z","email":true,"wearables":true,"location":false,"cgm":false,"extra":{}}"#
            profile = #"{"id":"p1","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z","target_glucose_min":70,"target_glucose_max":140,"libre_connected":false,"fitbit_connected":false,"extra":{}}"#
        }
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let path = request.url?.path ?? ""
        let method = request.httpMethod ?? "GET"
        let (status, body) = answer(method: method, path: path)
        let response = HTTPURLResponse(url: request.url ?? URL(string: "https://stub.invalid")!, statusCode: status,
                                       httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        return (Data(body.utf8), response)
    }

    private func answer(method: String, path: String) -> (Int, String) {
        lock.lock()
        defer { lock.unlock() }
        let me = #"{"id":"u1","email":"tester@example.com","full_name":"Test User","providers":["apple"]}"#
        switch (method, path) {
        case ("POST", "/api/v1/auth/refresh"), ("POST", "/api/v1/auth/apple"), ("POST", "/api/v1/auth/google"):
            return (200, #"{"access_token":"stub-access","refresh_token":"stub-refresh","expires_in":900,"token_type":"bearer","user":\#(me)}"#)
        case ("GET", "/api/v1/me"):
            return (200, me)
        case ("DELETE", "/api/v1/me"), ("POST", "/api/v1/auth/logout"):
            return (204, "")
        case ("GET", "/api/v1/entities/PrivacyConsent"):
            return (200, "[\(consent ?? "")]")
        case ("POST", "/api/v1/entities/PrivacyConsent"):
            consent = #"{"id":"c1","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z","email":true,"wearables":false,"extra":{}}"#
            return (201, consent ?? "{}")
        case ("GET", "/api/v1/entities/UserProfile"):
            return (200, "[\(profile ?? "")]")
        case ("POST", "/api/v1/entities/UserProfile"):
            profile = #"{"id":"p1","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z","target_glucose_min":70,"target_glucose_max":140,"extra":{}}"#
            return (201, profile ?? "{}")
        default:
            if method == "GET" && path.hasPrefix("/api/v1/entities/") { return (200, "[]") }
            if path.hasPrefix("/api/v1/ai/") { return (503, #"{"detail":"stub","retryable":true}"#) }
            return (200, "{}")
        }
    }
}
