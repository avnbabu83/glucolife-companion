import Foundation

/// An API failure, mirroring the web ApiError: HTTP status plus the fields screens act on.
struct APIError: Error, Equatable, LocalizedError {
    let status: Int
    let code: String?
    let message: String
    let retryable: Bool
    let retryAfter: Int?
    let needsAuth: Bool

    init(status: Int, code: String? = nil, message: String, retryable: Bool = false,
         retryAfter: Int? = nil, needsAuth: Bool = false) {
        self.status = status
        self.code = code
        self.message = message
        self.retryable = retryable
        self.retryAfter = retryAfter
        self.needsAuth = needsAuth
    }

    /// Builds the error from a non-2xx response body ({ detail | error | message, retryable, needsAuth }).
    init(status: Int, body: Data, retryAfterHeader: String?) {
        let json = (try? JSONValue.decode(body)) ?? .null
        let detail = json["detail"]
        let errorCode = json["error"]?.stringValue
        var text = detail?.stringValue ?? json["message"]?.stringValue ?? errorCode
        if text == nil, let list = detail?.arrayValue, let first = list.first {
            text = first["msg"]?.stringValue
        }
        self.init(
            status: status,
            code: errorCode ?? detail?.stringValue,
            message: text ?? APIError.defaultMessage(for: status),
            retryable: json["retryable"]?.boolValue ?? (status == 503),
            retryAfter: retryAfterHeader.flatMap { Int($0) },
            needsAuth: json["needsAuth"]?.boolValue ?? false
        )
    }

    static let offline = APIError(status: 0, code: "offline",
                                  message: "No connection. Check your internet and try again.", retryable: true)

    static func defaultMessage(for status: Int) -> String {
        switch status {
        case 401: return "Your session has ended. Please sign in again."
        case 403: return "You have not allowed this."
        case 404: return "Not found."
        case 413: return "The photo is too large."
        case 415: return "This photo format is not supported."
        case 422: return "Some information is missing or invalid."
        case 429: return "You have reached today's AI limit. It resets at midnight UTC."
        case 502: return "The service returned an unexpected answer. Please try again."
        case 503: return "The service is busy. Please try again in a moment."
        case 504: return "This took too long. Please try again."
        default: return "Something went wrong (\(status))."
        }
    }

    /// The text a screen shows for this error.
    var userMessage: String {
        switch status {
        case 401, 429, 503, 504: return APIError.defaultMessage(for: status)
        default: return message
        }
    }

    var errorDescription: String? { userMessage }
}
