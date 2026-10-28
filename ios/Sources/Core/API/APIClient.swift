import Foundation

/// The signed-in user from GET /api/v1/me.
struct Me: Codable, Equatable {
    let id: String
    let email: String
    let fullName: String?
    let providers: [String]
    let integrationsAvailable: [String]?

    enum CodingKeys: String, CodingKey {
        case id, email, providers
        case fullName = "full_name"
        case integrationsAvailable = "integrations_available"
    }
}

struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
    let user: Me

    enum CodingKeys: String, CodingKey {
        case user
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
    }
}

/// HTTP client for /api/v1: adds the bearer token, refreshes once on 401 (shared by concurrent calls), retries
/// the request once and maps failures to APIError.
final class APIClient {
    let baseURL: String
    let transport: HTTPTransport
    let session: SessionStore
    /// Called on the main actor when the session ends because the refresh token no longer works.
    var onSessionEnded: (() -> Void)?

    init(baseURL: String, transport: HTTPTransport, session: SessionStore) {
        self.baseURL = baseURL.hasSuffix("/") ? String(baseURL.dropLast()) : baseURL
        self.transport = transport
        self.session = session
    }

    // MARK: - Requests

    func makeRequest(_ method: String, _ path: String, query: [URLQueryItem] = [], body: Data? = nil,
                     contentType: String = "application/json", token: String?) -> URLRequest {
        var components = URLComponents(string: baseURL + path) ?? URLComponents()
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url ?? URL(string: baseURL)!)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            return try await transport.send(request)
        } catch let error as APIError {
            throw error
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw APIError.offline
        }
    }

    private func check(_ data: Data, _ response: HTTPURLResponse) throws -> Data {
        guard (200..<300).contains(response.statusCode) else {
            throw APIError(status: response.statusCode, body: data,
                           retryAfterHeader: response.value(forHTTPHeaderField: "Retry-After"))
        }
        return data
    }

    /// Sends a request and returns the response body of a 2xx answer.
    @discardableResult
    func send(_ method: String, _ path: String, query: [URLQueryItem] = [], body: Data? = nil,
              contentType: String = "application/json", authorized: Bool = true) async throws -> Data {
        let token = authorized ? await session.currentAccessToken() : nil
        let (data, response) = try await perform(makeRequest(method, path, query: query, body: body,
                                                             contentType: contentType, token: token))
        guard authorized, response.statusCode == 401 else { return try check(data, response) }

        let fresh: String
        do {
            fresh = try await session.refreshedToken(replacing: token, using: { [weak self] refreshToken in
                guard let self else { throw CancellationError() }
                return try await self.refreshCall(refreshToken)
            })
        } catch let error as APIError where error.status == 401 || error.status == 403 {
            await endSession()
            throw APIError(status: 401, code: "session_ended", message: APIError.defaultMessage(for: 401))
        }
        let (retryData, retryResponse) = try await perform(makeRequest(method, path, query: query, body: body,
                                                                       contentType: contentType, token: fresh))
        if retryResponse.statusCode == 401 { await endSession() }
        return try check(retryData, retryResponse)
    }

    func json(_ method: String, _ path: String, query: [URLQueryItem] = [], body: JSONValue? = nil,
              authorized: Bool = true) async throws -> JSONValue {
        let data = try await send(method, path, query: query, body: try body?.encoded(), authorized: authorized)
        return data.isEmpty ? .null : try JSONValue.decode(data)
    }

    // MARK: - Session

    private func refreshCall(_ refreshToken: String) async throws -> RefreshResult {
        let body = try JSONValue.object(["refresh_token": .string(refreshToken)]).encoded()
        let (data, response) = try await perform(makeRequest("POST", Endpoints.refresh, body: body, token: nil))
        let ok = try check(data, response)
        let tokens = try JSONDecoder().decode(TokenResponse.self, from: ok)
        return RefreshResult(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken)
    }

    private func endSession() async {
        await session.clear()
        await MainActor.run { self.onSessionEnded?() }
    }

    /// App launch: refresh from the Keychain token and load the user, or nil when there is no session.
    func restoreSession() async throws -> Me? {
        guard await session.hasRefreshToken() else { return nil }
        do {
            _ = try await session.refreshedToken(replacing: nil, using: { [weak self] refreshToken in
                guard let self else { throw CancellationError() }
                return try await self.refreshCall(refreshToken)
            })
        } catch let error as APIError where error.status == 401 || error.status == 403 {
            await session.clear()
            return nil
        }
        let data = try await send("GET", Endpoints.me)
        return try JSONDecoder().decode(Me.self, from: data)
    }

    /// POST /api/v1/auth/{apple|google} with client 'ios'; keeps the access token in memory and the refresh
    /// token in the Keychain.
    func signIn(path: String, body: [String: JSONValue]) async throws -> Me {
        var payload = body
        payload["client"] = .string("ios")
        let data = try await send("POST", path, body: try JSONValue.object(payload).encoded(), authorized: false)
        let tokens = try JSONDecoder().decode(TokenResponse.self, from: data)
        await session.start(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken)
        return tokens.user
    }

    /// Sign out: logout on the server (best effort; it also ends the web session) and forget all tokens.
    func signOut() async {
        _ = try? await send("POST", Endpoints.logout)
        await session.clear()
    }

    // MARK: - Uploads

    struct Upload: Equatable {
        let fileKey: String
        let fileURL: URL?
    }

    /// POST /api/v1/uploads with a JPEG (field 'file').
    func uploadJPEG(_ jpeg: Data) async throws -> Upload {
        let form = MultipartForm(fieldName: "file", fileName: "photo.jpg", mimeType: "image/jpeg", data: jpeg)
        let data = try await send("POST", Endpoints.uploads, body: form.body, contentType: form.contentType)
        let json = try JSONValue.decode(data)
        guard let key = json["file_key"]?.stringValue else {
            throw APIError(status: 502, message: "The upload answer had no file key.")
        }
        return Upload(fileKey: key, fileURL: json["file_url"]?.stringValue.flatMap { URL(string: $0) })
    }
}

/// multipart/form-data body with one file field.
struct MultipartForm {
    let boundary: String
    let body: Data

    init(fieldName: String, fileName: String, mimeType: String, data: Data,
         boundary: String = "DiabetEasy-\(UUID().uuidString)") {
        self.boundary = boundary
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(fileName)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        self.body = body
    }

    var contentType: String { "multipart/form-data; boundary=\(boundary)" }
}
