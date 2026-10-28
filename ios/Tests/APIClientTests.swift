import XCTest
@testable import iOSApp

/// Scripted HTTP answers keyed on the request; counts refresh calls.
final class MockTransport: HTTPTransport {
    private let lock = NSLock()
    private var _refreshCalls = 0
    private var _requests: [URLRequest] = []
    var refreshDelayNanoseconds: UInt64 = 0
    var refreshStatus = 200
    var newAccessToken = "new-access"

    var refreshCalls: Int { lock.lock(); defer { lock.unlock() }; return _refreshCalls }
    var requests: [URLRequest] { lock.lock(); defer { lock.unlock() }; return _requests }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        lock.lock()
        _requests.append(request)
        lock.unlock()
        let path = request.url?.path ?? ""
        let status: Int
        let body: String
        if path == Endpoints.refresh {
            lock.lock()
            _refreshCalls += 1
            lock.unlock()
            if refreshDelayNanoseconds > 0 { try await Task.sleep(nanoseconds: refreshDelayNanoseconds) }
            status = refreshStatus
            body = refreshStatus == 200
                ? #"{"access_token":"\#(newAccessToken)","expires_in":900,"user":{"id":"u1","email":"a@b.c","providers":["apple"]}}"#
                : #"{"detail":"Session has ended, sign in again"}"#
        } else if request.value(forHTTPHeaderField: "Authorization") == "Bearer \(newAccessToken)" {
            status = 200
            body = #"{"id":"u1","email":"a@b.c","providers":["apple"]}"#
        } else {
            status = 401
            body = #"{"detail":"Invalid or expired access token"}"#
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (Data(body.utf8), response)
    }
}

final class Flag {
    var value = false
}

final class APIClientTests: XCTestCase {
    private func makeClient(_ transport: MockTransport, refreshToken: String? = "refresh-1",
                            accessToken: String? = "old-access") async -> (APIClient, InMemoryTokenStore) {
        let store = InMemoryTokenStore(token: refreshToken)
        let session = SessionStore(tokenStore: store)
        if let accessToken { await session.start(accessToken: accessToken, refreshToken: nil) }
        return (APIClient(baseURL: "https://api.example.test", transport: transport, session: session), store)
    }

    func testA401RefreshesOnceAndRetriesOnce() async throws {
        let transport = MockTransport()
        let (client, _) = await makeClient(transport)

        let data = try await client.send("GET", Endpoints.me)

        XCTAssertFalse(data.isEmpty)
        XCTAssertEqual(transport.refreshCalls, 1)
        XCTAssertEqual(transport.requests.count, 3, "original, refresh, retry")
        let refreshBody = try JSONValue.decode(transport.requests[1].httpBody ?? Data())
        XCTAssertEqual(refreshBody["refresh_token"]?.stringValue, "refresh-1")
        XCTAssertNil(transport.requests[1].value(forHTTPHeaderField: "Authorization"))
        let current = await client.session.currentAccessToken()
        XCTAssertEqual(current, "new-access")
    }

    func testConcurrent401sShareOneRefresh() async throws {
        let transport = MockTransport()
        transport.refreshDelayNanoseconds = 200_000_000
        let (client, _) = await makeClient(transport)

        async let first = client.send("GET", Endpoints.me)
        async let second = client.send("GET", Endpoints.entities("GlucoseReading"))
        async let third = client.send("GET", Endpoints.entities("MealPlan"))
        _ = try await (first, second, third)

        XCTAssertEqual(transport.refreshCalls, 1)
    }

    func testFailedRefreshEndsTheSession() async throws {
        let transport = MockTransport()
        transport.refreshStatus = 401
        let (client, store) = await makeClient(transport)
        let ended = Flag()
        client.onSessionEnded = { ended.value = true }

        do {
            try await client.send("GET", Endpoints.me)
            XCTFail("expected a 401")
        } catch let error as APIError {
            XCTAssertEqual(error.status, 401)
        }

        XCTAssertTrue(ended.value)
        XCTAssertNil(store.load(), "the refresh token is removed")
        let current = await client.session.currentAccessToken()
        XCTAssertNil(current)
        XCTAssertEqual(transport.refreshCalls, 1, "no retry loop")
    }

    func testSignInKeepsAccessTokenInMemoryOnly() async throws {
        let transport = SignInTransport()
        let store = InMemoryTokenStore()
        let client = APIClient(baseURL: "https://api.example.test", transport: transport,
                               session: SessionStore(tokenStore: store))

        let me = try await client.signIn(path: Endpoints.signInApple, body: ["id_token": .string("id-token-123")])

        XCTAssertEqual(me.email, "a@b.c")
        XCTAssertEqual(store.load(), "refresh-xyz")
        let sentBody = try JSONValue.decode(transport.lastRequest?.httpBody ?? Data())
        XCTAssertEqual(sentBody["client"]?.stringValue, "ios")
        let defaults = UserDefaults.standard.dictionaryRepresentation().values.compactMap { $0 as? String }
        XCTAssertFalse(defaults.contains("access-abc"), "the access token is never written to UserDefaults")
        let current = await client.session.currentAccessToken()
        XCTAssertEqual(current, "access-abc")

        await client.signOut()
        XCTAssertNil(store.load())
    }

    func testErrorsMapLikeTheWebApiError() {
        let limit = APIError(status: 429, body: Data(#"{"detail":"Daily AI limit reached"}"#.utf8), retryAfterHeader: "3600")
        XCTAssertEqual(limit.retryAfter, 3600)
        let busy = APIError(status: 503, body: Data(#"{"detail":"busy","retryable":true}"#.utf8), retryAfterHeader: nil)
        XCTAssertTrue(busy.retryable)
        let libre = APIError(status: 400, body: Data(#"{"error":"expired","needsAuth":true}"#.utf8), retryAfterHeader: nil)
        XCTAssertTrue(libre.needsAuth)
        let consent = APIError(status: 403, body: Data(#"{"error":"consent_required"}"#.utf8), retryAfterHeader: nil)
        XCTAssertEqual(consent.code, "consent_required")
    }

    func testKeychainWritesAreThisDeviceOnlyAfterFirstUnlock() {
        let query = KeychainStore.addQuery(token: "t")
        XCTAssertEqual(query[kSecAttrAccessible as String] as? String,
                       kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
        XCTAssertEqual(query[kSecAttrSynchronizable as String] as? Bool, false)
    }

    func testMultipartBodyHasTheFileField() {
        let form = MultipartForm(fieldName: "file", fileName: "photo.jpg", mimeType: "image/jpeg",
                                 data: Data([0xFF, 0xD8, 0xFF]), boundary: "B")
        let text = String(decoding: form.body, as: UTF8.self)
        XCTAssertTrue(text.hasPrefix("--B\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\""))
        XCTAssertTrue(text.hasSuffix("\r\n--B--\r\n"))
        XCTAssertEqual(form.contentType, "multipart/form-data; boundary=B")
    }
}

final class SignInTransport: HTTPTransport {
    var lastRequest: URLRequest?

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        lastRequest = request
        let body: String
        let status: Int
        if request.url?.path == Endpoints.logout {
            status = 204
            body = ""
        } else {
            status = 200
            body = #"{"access_token":"access-abc","refresh_token":"refresh-xyz","expires_in":900,"user":{"id":"u1","email":"a@b.c","providers":["apple"]}}"#
        }
        return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}
