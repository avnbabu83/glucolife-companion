# DiabetEasy for iPhone (Phase 3)

A native SwiftUI app (iOS 17+, iPhone, portrait) on the same API as the website (`/api/v1`). Logic that can be
tested without a screen is in `Sources/Core` (tests in `Tests`), screens are in `Sources/Views`, app wiring in
`Sources/App`. The Xcode project is generated from `project.yml` by XcodeGen.

| Area | Where |
| --- | --- |
| API client: bearer token, one shared refresh on 401 then one retry, `APIError`, multipart upload | `Sources/Core/API/APIClient.swift`, `SessionStore.swift`, `APIError.swift` |
| Paths the app calls (checked against `api/openapi.json` by `api/tests/test_ios_contract.py`) | `Sources/Core/API/Endpoints.swift` |
| Entities and the `extra` rule (same as the web row adapter) | `Sources/Core/API/EntityStore.swift` |
| Refresh token in the Keychain (this device only, after first unlock); access token in memory | `Sources/Core/Session/KeychainStore.swift` |
| Sign in with Apple and Google | `Sources/Views/SignInView.swift` |
| Apple Health glucose: read-only, 30-day first import, batches of 500, anchor saved after success, hourly background delivery | `Sources/Core/Health/HealthKitGlucoseSync.swift`, `Sources/Core/Logic/GlucoseImport.swift` |
| Photos: library or camera, 1568 px JPEG, `POST /api/v1/uploads` | `Sources/Core/Photos/ImageResizer.swift`, `PhotoField` in `Sources/Views/Components.swift` |
| Tabs: Dashboard, Log, Meals, Insights, More | `Sources/Views/*.swift` |
| Privacy manifest, app icon, accent colour (emerald, one colour set) | `Sources/Resources/` |

## Build and test

There is no Mac in the Stormbreaker sandbox. GitHub builds and tests the app on a Mac for every push that changes
`ios/` (`.github/workflows/stormbreaker-ios.yml`, unit tests plus UI tests against a stubbed API). The run's
**Artifacts** include `ios-simulator-app`.

On your own Mac (Xcode 16 or later):

```sh
brew install xcodegen
cd ios
xcodegen generate            # makes iOSApp.xcodeproj from project.yml
open iOSApp.xcodeproj        # Run on a simulator or your iPhone
xcodebuild test -project iOSApp.xcodeproj -scheme iOSApp -destination 'platform=iOS Simulator,name=iPhone 15'
```

Debug builds talk to `https://staging.diabeteasy.com`; Release builds (TestFlight, App Store) to
`https://diabeteasy.com` (`Sources/App/AppConfig.swift`).

## Before the first TestFlight build (customer consoles)

1. **Bundle ID.** The app uses `com.diabeteasy.app` (`project.yml`, `PRODUCT_BUNDLE_IDENTIFIER`). Change it there if you
   pick another. In the Apple Developer account (the same team as the web Services ID, so Apple sign-in finds the
   same account) create the App ID with **HealthKit** and **Sign in with Apple**.
2. **Google.** In Google Cloud create an OAuth client of type *iOS* for the bundle ID. Put its client ID in
   `AppConfig.googleClientID`. The app signs in through Google's page with PKCE; the redirect
   `com.googleusercontent.apps.<id>:/oauth2redirect` is derived from the client ID.
3. **Fitbit.** Put the Fitbit app's client ID in `AppConfig.fitbitClientID` and register the redirect URI
   `com.diabeteasy.app:/fitbit/callback` in the Fitbit developer app.
4. **API settings** (ECS task definitions, then redeploy): add the bundle ID to `APPLE_CLIENT_IDS`, the iOS Google
   client ID to `GOOGLE_CLIENT_IDS`, and `com.diabeteasy.app:/fitbit/callback` to `FITBIT_REDIRECT_URIS`. Deploy the API
   (it already has `POST /api/v1/glucose/import`) to production before a TestFlight build points at it.
5. **App Store Connect.** Create the app record for the bundle ID and an App Store Connect API key (App Manager). Add
   the repository secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` and `APPLE_TEAM_ID`.

## TestFlight and App Store

- Run the **TestFlight** workflow (`.github/workflows/stormbreaker-testflight.yml`, Actions tab > Run workflow). It
  archives with automatic signing and uploads the build; the build number is the run number. Add internal testers
  first, then an external group (Apple reviews the first external build).
- Submission is done by you in App Store Connect after TestFlight sign-off:
  - screenshots (6.7-inch and 6.5-inch iPhone), category (Medical or Health & Fitness), age rating;
  - privacy policy URL (`https://diabeteasy.com/privacy`, must mention Apple Health and Anthropic processing) and
    privacy labels matching `Sources/Resources/PrivacyInfo.xcprivacy`: health, user ID, email address and photos,
    linked to the user, used for app functionality, no tracking;
  - review notes: reviewers can sign in with their own Apple ID (open sign-up); Libre and Fitbit need the reviewer's
    own accounts; Apple Health glucose can be added in the Health app on the review device; Dexcom and Medtronic are
    simulated; AI analysis asks for permission before any data is sent to Anthropic; More > Delete account deletes
    the account in the app;
  - the medical disclaimer wording you choose (the app shows "DiabetEasy does not provide medical advice" in More).

## Privacy behaviour

- Apple Health is offered only when the Wearables consent is on; the app asks to *read* blood glucose only and never
  writes. If the server answers 403 `consent_required`, syncing stops and the Privacy screen opens.
- Before the first AI action the app asks for permission and stores it in `PrivacyConsent.extra.ai_processing`
  (and `ai_processing_at`). Without it, the server leaves Apple Health readings out of AI prompts.
- No API response is cached on disk (ephemeral `URLSession`, no URL cache). The HealthKit anchor, last import time and
  the once-a-day trend card date are in `UserDefaults` and are removed on sign-out and account deletion.
- Sign-out also ends the web session (the server bumps the token version).
