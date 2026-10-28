import XCTest

/// Screen tests against a stubbed API (launch argument -uiTestStub): no network, no real accounts.
final class AppUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ arguments: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestStub"] + arguments
        app.launch()
        return app
    }

    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    /// Scrolls the current form until the element exists and is hittable.
    @discardableResult
    private func reveal(_ element: XCUIElement, in app: XCUIApplication, attempts: Int = 8) -> Bool {
        if element.waitForExistence(timeout: 5) && element.isHittable { return true }
        for _ in 0..<attempts {
            app.swipeUp()
            if element.exists && element.isHittable { return true }
        }
        return element.exists
    }

    func testSignInScreenShowsAppleAndGoogle() {
        let app = launch([])
        XCTAssertTrue(element(app, "sign-in-google").waitForExistence(timeout: 10))
        XCTAssertTrue(element(app, "sign-in-apple").exists)
    }

    func testFirstRunOpensConsentThenProfile() {
        let app = launch(["-uiTestSignedIn", "-uiTestFirstRun"])
        let consentSave = element(app, "consent-save")
        XCTAssertTrue(reveal(consentSave, in: app))
        consentSave.tap()

        let profileSave = element(app, "profile-save")
        XCTAssertTrue(reveal(profileSave, in: app))
        profileSave.tap()

        XCTAssertTrue(app.tabBars.buttons["Dashboard"].waitForExistence(timeout: 10))
    }

    func testEveryTabAndMoreItemOpens() {
        let app = launch(["-uiTestSignedIn"])
        XCTAssertTrue(app.tabBars.buttons["Dashboard"].waitForExistence(timeout: 10))
        for tab in ["Log", "Meals", "Insights", "More", "Dashboard"] {
            app.tabBars.buttons[tab].tap()
            XCTAssertTrue(app.navigationBars[tab].waitForExistence(timeout: 5), "\(tab) tab")
        }
        app.tabBars.buttons["More"].tap()
        let items = [("more-profile", "Profile"), ("more-medication", "Medication"), ("more-sleep", "Sleep"),
                     ("more-devices", "Devices"), ("more-privacy", "Privacy")]
        for (identifier, title) in items {
            let link = element(app, identifier)
            XCTAssertTrue(reveal(link, in: app), identifier)
            link.tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5), title)
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
    }

    func testAIPermissionSheetComesBeforeTheFirstAIRequest() {
        let app = launch(["-uiTestSignedIn"])
        XCTAssertTrue(app.tabBars.buttons["Insights"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Insights"].tap()
        let button = element(app, "ai-recommendations")
        XCTAssertTrue(button.waitForExistence(timeout: 5))
        button.tap()
        XCTAssertTrue(element(app, "ai-allow").waitForExistence(timeout: 5))
        element(app, "ai-not-now").tap()
        XCTAssertTrue(button.waitForExistence(timeout: 5))
    }

    func testDeleteAccountConfirmsAndReturnsToSignIn() {
        let app = launch(["-uiTestSignedIn"])
        XCTAssertTrue(app.tabBars.buttons["More"].waitForExistence(timeout: 10))
        app.tabBars.buttons["More"].tap()
        let link = element(app, "more-delete-account")
        XCTAssertTrue(reveal(link, in: app))
        link.tap()
        let delete = element(app, "delete-account")
        XCTAssertTrue(delete.waitForExistence(timeout: 5))
        delete.tap()
        _ = app.buttons["Delete account"].waitForExistence(timeout: 5)
        sleep(1)
        let confirm = app.buttons.matching(NSPredicate(format: "label == %@", "Delete account")).allElementsBoundByIndex
            .last { $0.isHittable }
        XCTAssertNotNil(confirm, "the confirmation is shown")
        confirm?.tap()
        XCTAssertTrue(element(app, "sign-in-google").waitForExistence(timeout: 10))
    }
}
