import Foundation

/// Every API path the app calls. api/tests/test_ios_contract.py checks each one against api/openapi.json,
/// so a server change that breaks the iPhone app fails the API tests.
enum Endpoints {
    static let signInApple = "/api/v1/auth/apple"
    static let signInGoogle = "/api/v1/auth/google"
    static let refresh = "/api/v1/auth/refresh"
    static let logout = "/api/v1/auth/logout"
    static let me = "/api/v1/me"
    static let uploads = "/api/v1/uploads"
    static let glucoseImport = "/api/v1/glucose/import"

    static func entities(_ entity: String) -> String { "/api/v1/entities/\(entity)" }
    static func entity(_ entity: String, id: String) -> String { "/api/v1/entities/\(entity)/\(id)" }
    static func ai(_ task: String) -> String { "/api/v1/ai/\(task)" }
    static func integration(_ provider: String, _ action: String) -> String {
        "/api/v1/integrations/\(provider)/\(action)"
    }
}
