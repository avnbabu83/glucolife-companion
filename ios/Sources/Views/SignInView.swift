import AuthenticationServices
import SwiftUI

/// Sign in with Apple (system button) or Google (OAuth with PKCE in an ephemeral web session).
struct SignInView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession
    @State private var appleNonce = AuthCrypto.randomHex()
    @State private var busy = false
    @State private var errorText: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "drop.fill")
                .font(.system(size: 56))
                .foregroundStyle(Color.accentColor)
            Text("DiabetEasy").font(.largeTitle.bold())
            Text("Track glucose, meals, activity and sleep, with insights that fit your day.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
            Spacer()

            SignInWithAppleButton(.signIn) { request in
                appleNonce = AuthCrypto.randomHex()
                request.requestedScopes = [.fullName, .email]
                request.nonce = AuthCrypto.sha256Hex(appleNonce)
            } onCompletion: { result in
                handleApple(result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .disabled(busy)
            .accessibilityIdentifier("sign-in-apple")

            Button {
                Task { await signInWithGoogle() }
            } label: {
                HStack {
                    Text("G").font(.title3.bold())
                    Text("Sign in with Google").font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.bordered)
            .tint(.primary)
            .disabled(busy)
            .accessibilityIdentifier("sign-in-google")

            if busy { ProgressView() }
            if let errorText {
                Text(errorText).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
            }

            HStack(spacing: 16) {
                Link("Privacy policy", destination: AppConfig.privacyPolicyURL)
                Link("Terms", destination: AppConfig.termsURL)
            }
            .font(.footnote)
        }
        .padding(24)
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled {
                errorText = "Apple sign-in did not complete. Please try again."
            }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8) else {
                errorText = "Apple sign-in did not return a token."
                return
            }
            var body: [String: JSONValue] = ["id_token": .string(idToken), "nonce": .string(appleNonce)]
            if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) {
                body["authorization_code"] = .string(code)
            }
            if let name = credential.fullName {
                let formatted = PersonNameComponentsFormatter().string(from: name)
                if !formatted.isEmpty { body["full_name"] = .string(formatted) }
            }
            Task { await finish(path: Endpoints.signInApple, body: body) }
        }
    }

    private func signInWithGoogle() async {
        errorText = nil
        let verifier = AuthCrypto.randomHex()
        let nonce = AuthCrypto.randomHex()
        let state = AuthCrypto.randomHex(byteCount: 16)
        guard AppConfig.isConfigured,
              let url = AuthCrypto.googleAuthorizeURL(clientID: AppConfig.googleClientID,
                                                      redirectURI: AppConfig.googleRedirectURI,
                                                      verifier: verifier, nonce: nonce, state: state) else {
            errorText = "Google sign-in is not set up in this build."
            return
        }
        busy = true
        defer { busy = false }
        do {
            let callback = try await webAuthenticationSession.authenticate(
                using: url, callbackURLScheme: AppConfig.googleCallbackScheme, preferredBrowserSession: .ephemeral)
            guard let code = AuthCrypto.authorizationCode(from: callback, expectedState: state) else {
                errorText = "Google sign-in did not complete. Please try again."
                return
            }
            let idToken = try await GoogleTokenExchange.idToken(code: code, verifier: verifier)
            await finish(path: Endpoints.signInGoogle, body: ["id_token": .string(idToken), "nonce": .string(nonce)])
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return
        } catch {
            errorText = "Google sign-in did not complete. Please try again."
        }
    }

    private func finish(path: String, body: [String: JSONValue]) async {
        busy = true
        defer { busy = false }
        do {
            let me = try await app.client.signIn(path: path, body: body)
            errorText = nil
            await app.signedIn(me)
        } catch {
            errorText = app.message(for: error)
        }
    }
}

/// Exchanges a Google authorization code for an ID token (iOS clients are public: PKCE, no secret).
enum GoogleTokenExchange {
    static func idToken(code: String, verifier: String) async throws -> String {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "client_id", value: AppConfig.googleClientID),
            URLQueryItem(name: "redirect_uri", value: AppConfig.googleRedirectURI),
            URLQueryItem(name: "code_verifier", value: verifier),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
        ]
        request.httpBody = Data((form.percentEncodedQuery ?? "").utf8)
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        let (data, response) = try await URLSession(configuration: config).data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let token = (try? JSONValue.decode(data))?["id_token"]?.stringValue else {
            throw APIError(status: 401, message: "Google did not return an ID token.")
        }
        return token
    }
}
