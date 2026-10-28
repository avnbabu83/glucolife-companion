import Foundation

/// Where the refresh token lives. The app uses KeychainStore; tests use InMemoryTokenStore.
protocol RefreshTokenStore: AnyObject {
    func load() -> String?
    @discardableResult func save(_ token: String) -> Bool
    func clear()
}

final class InMemoryTokenStore: RefreshTokenStore {
    private let lock = NSLock()
    private var token: String?

    init(token: String? = nil) { self.token = token }

    func load() -> String? {
        lock.lock(); defer { lock.unlock() }
        return token
    }

    @discardableResult func save(_ token: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        self.token = token
        return true
    }

    func clear() {
        lock.lock(); defer { lock.unlock() }
        token = nil
    }
}

/// Result of POST /api/v1/auth/refresh: the new access token and, if the server rotates it, a new refresh token.
struct RefreshResult {
    let accessToken: String
    let refreshToken: String?
}

/// Holds the access token in memory only and runs at most one refresh at a time.
actor SessionStore {
    private var accessToken: String?
    private var refreshTask: Task<RefreshResult, Error>?
    private let tokenStore: RefreshTokenStore

    init(tokenStore: RefreshTokenStore) {
        self.tokenStore = tokenStore
    }

    func currentAccessToken() -> String? { accessToken }

    func hasRefreshToken() -> Bool { tokenStore.load() != nil }

    func start(accessToken: String, refreshToken: String?) {
        self.accessToken = accessToken
        if let refreshToken { tokenStore.save(refreshToken) }
    }

    func clear() {
        accessToken = nil
        refreshTask?.cancel()
        refreshTask = nil
        tokenStore.clear()
    }

    /// Returns a usable access token after `stale` was rejected with 401. Concurrent callers share one refresh;
    /// a caller whose token was already replaced gets the new one without another refresh.
    func refreshedToken(replacing stale: String?,
                        using refresh: @escaping (String) async throws -> RefreshResult) async throws -> String {
        if let current = accessToken, current != stale { return current }
        if let running = refreshTask {
            return try await running.value.accessToken
        }
        guard let refreshToken = tokenStore.load() else {
            throw APIError(status: 401, code: "no_session", message: APIError.defaultMessage(for: 401))
        }
        let task = Task<RefreshResult, Error> { try await refresh(refreshToken) }
        refreshTask = task
        do {
            let result = try await task.value
            refreshTask = nil
            accessToken = result.accessToken
            if let rotated = result.refreshToken { tokenStore.save(rotated) }
            return result.accessToken
        } catch {
            refreshTask = nil
            throw error
        }
    }
}
