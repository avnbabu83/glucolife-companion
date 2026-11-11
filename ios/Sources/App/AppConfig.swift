import Foundation

/// Public identifiers only (no secrets). Debug builds use staging, Release builds (TestFlight, App Store) production.
/// Replace the placeholder client IDs before the first TestFlight build; see ios/README.md.
enum AppConfig {
    #if DEBUG
    static let apiBaseURL = "https://staging.diabeteasy.com"
    #else
    static let apiBaseURL = "https://diabeteasy.com"
    #endif

    static var bundleID: String { Bundle.main.bundleIdentifier ?? "com.diabeteasy.app" }

    /// iOS OAuth client from Google Cloud (type iOS, same bundle ID). Also add it to GOOGLE_CLIENT_IDS on the API.
    static let googleClientID = "REPLACE_WITH_IOS_CLIENT_ID.apps.googleusercontent.com"

    /// com.googleusercontent.apps.<id>: the redirect scheme Google allows for iOS clients.
    static var googleCallbackScheme: String {
        googleClientID.split(separator: ".").reversed().joined(separator: ".")
    }

    static var googleRedirectURI: String { "\(googleCallbackScheme):/oauth2redirect" }

    /// Fitbit app client ID (public). Its redirect '<bundle id>:/fitbit/callback' must be registered at Fitbit
    /// and listed in FITBIT_REDIRECT_URIS on the API.
    static let fitbitClientID = "REPLACE_WITH_FITBIT_CLIENT_ID"
    static var fitbitCallbackScheme: String { bundleID }
    static var fitbitRedirectURI: String { "\(bundleID):/fitbit/callback" }

    static let privacyPolicyURL = URL(string: "https://diabeteasy.com/privacy")!
    static let termsURL = URL(string: "https://diabeteasy.com/terms")!

    static var isConfigured: Bool { !googleClientID.hasPrefix("REPLACE") }
}
