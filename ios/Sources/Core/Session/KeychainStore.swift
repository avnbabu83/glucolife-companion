import Foundation
import Security

/// Refresh token in the Keychain: this device only (no iCloud sync or restore elsewhere) and readable after the
/// first unlock, so hourly background Apple Health uploads can refresh the session while the phone is locked.
final class KeychainStore: RefreshTokenStore {
    static let service = "com.diabeteasy.app.session"
    static let account = "refresh_token"

    /// Attributes used for every write; kept separate so a unit test can check the accessibility class.
    static func addQuery(token: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
            kSecValueData as String: Data(token.utf8),
        ]
    }

    static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func load() -> String? {
        var query = KeychainStore.baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult func save(_ token: String) -> Bool {
        SecItemDelete(KeychainStore.baseQuery() as CFDictionary)
        return SecItemAdd(KeychainStore.addQuery(token: token) as CFDictionary, nil) == errSecSuccess
    }

    func clear() {
        SecItemDelete(KeychainStore.baseQuery() as CFDictionary)
    }
}
