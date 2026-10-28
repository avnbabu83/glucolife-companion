import CryptoKit
import Foundation
import Security

/// Nonces, PKCE pairs and the OAuth URLs for Google sign-in and Fitbit connect.
enum AuthCrypto {
    /// 32 random bytes from SecRandomCopyBytes, hex encoded (64 characters).
    static func randomHex(byteCount: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        if SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes) != errSecSuccess {
            bytes = (0..<byteCount).map { _ in UInt8.random(in: 0...255) }
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    static func sha256Hex(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// PKCE S256 challenge for a verifier.
    static func codeChallenge(for verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    /// Google OAuth for an iOS client (public client, PKCE, no secret). The ID token carries `nonce`.
    static func googleAuthorizeURL(clientID: String, redirectURI: String, verifier: String, nonce: String,
                                   state: String) -> URL? {
        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: codeChallenge(for: verifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]
        return components?.url
    }

    /// Fitbit OAuth 2.0 with PKCE; the API redeems the code with the same verifier.
    static func fitbitAuthorizeURL(clientID: String, redirectURI: String, verifier: String, state: String) -> URL? {
        var components = URLComponents(string: "https://www.fitbit.com/oauth2/authorize")
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "activity sleep heartrate profile"),
            URLQueryItem(name: "code_challenge", value: codeChallenge(for: verifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
        ]
        return components?.url
    }

    /// Reads `code` from an OAuth callback URL after checking `state`. Nil when cancelled, denied or tampered.
    static func authorizationCode(from callback: URL, expectedState: String) -> String? {
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first(where: { $0.name == name })?.value }
        guard value("error") == nil, value("state") == expectedState, let code = value("code"), !code.isEmpty else {
            return nil
        }
        return code
    }
}
