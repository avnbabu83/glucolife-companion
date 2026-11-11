import Foundation

/// Public identifiers only (no secrets). The one place that decides which server the app talks to:
/// Simulator, Debug and TestFlight installs use the beta server; App Store installs use diabeteasy.com.
/// Replace the placeholder client IDs before the first TestFlight build; see ios/README.md.
enum AppConfig {
    static let betaServerURL = "https://glucolife-companion.beta.stormbreakerapp.com"
    static let productionServerURL = "https://diabeteasy.com"

    static var isSimulatorOrDebug: Bool {
        #if targetEnvironment(simulator) || DEBUG
        return true
        #else
        return false
        #endif
    }

    /// TestFlight installs carry a sandbox App Store receipt.
    static func isTestFlight(receiptURL: URL?) -> Bool {
        receiptURL?.lastPathComponent == "sandboxReceipt"
    }

    static func serverURL(simulatorOrDebug: Bool, testFlight: Bool) -> String {
        simulatorOrDebug || testFlight ? betaServerURL : productionServerURL
    }

    static let apiBaseURL = serverURL(simulatorOrDebug: isSimulatorOrDebug,
                                      testFlight: isTestFlight(receiptURL: Bundle.main.appStoreReceiptURL))

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
