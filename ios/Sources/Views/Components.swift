import PhotosUI
import SwiftUI
import UIKit

extension JSONValue {
    var isBlank: Bool {
        switch self {
        case .null: return true
        case .string(let text): return text.trimmingCharacters(in: .whitespaces).isEmpty
        case .array(let items): return items.isEmpty
        case .object(let object): return object.isEmpty
        default: return false
        }
    }
}

/// Messages AI cards show, matching the web cards.
enum AIErrorText {
    static func message(_ error: Error) -> String {
        guard let api = error as? APIError else { return error.localizedDescription }
        switch api.status {
        case 422 where api.code == "insufficient_data":
            return "Not enough data yet. Log a few more readings and try again."
        case 422 where api.message.contains("image_not_supported"):
            return "This photo can't be analysed. Try another photo."
        case 429:
            if let seconds = api.retryAfter {
                let hours = max(1, Int((Double(seconds) / 3600).rounded(.up)))
                return "You've used today's AI analyses. They reset in about \(hours) hour\(hours == 1 ? "" : "s")."
            }
            return APIError.defaultMessage(for: 429)
        case 503: return "The AI assistant is busy. Please try again in a moment."
        case 0, 504: return "That took too long or the connection dropped. Please try again."
        default: return api.userMessage
        }
    }
}

/// Renders an AI result (any JSON) as headed sections and bullet lists.
struct JSONResultView: View {
    let value: JSONValue
    var depth = 0

    static func title(_ key: String) -> String {
        var spaced = ""
        for character in key {
            if character.isUppercase && !spaced.isEmpty { spaced.append(" ") }
            spaced.append(character == "_" ? " " : character)
        }
        return spaced.prefix(1).uppercased() + spaced.dropFirst().lowercased()
    }

    var body: some View {
        switch value {
        case .object(let object):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(object.keys.sorted(), id: \.self) { key in
                    if let item = object[key], !item.isBlank, key != "success" {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(JSONResultView.title(key))
                                .font(depth == 0 ? .subheadline.bold() : .caption.bold())
                            JSONResultView(value: item, depth: depth + 1)
                        }
                    }
                }
            }
        case .array(let items):
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 6) {
                        Text("•")
                        JSONResultView(value: item, depth: depth + 1)
                    }
                }
            }
        case .bool(let flag):
            Text(flag ? "Yes" : "No").font(.callout)
        case .null:
            EmptyView()
        default:
            Text(value.stringValue ?? "").font(.callout).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// An AI action: a button, a spinner, then the result (or the web's error messages). Asks for AI permission first.
struct AICardView: View {
    @EnvironmentObject private var app: AppState
    let title: String
    let systemImage: String
    let task: String
    var buttonTitle = "Analyze"
    var request: () -> [String: JSONValue] = { [:] }
    var onResult: ((JSONValue) -> Void)?
    var showResult = true

    @State private var loading = false
    @State private var result: JSONValue?
    @State private var errorText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage).font(.headline)
            Button {
                app.requireAI { run() }
            } label: {
                if loading { ProgressView() } else { Text(buttonTitle) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(loading)
            .accessibilityIdentifier("ai-\(task)")
            if let errorText {
                Text(errorText).font(.footnote).foregroundStyle(.red)
            }
            if showResult, let result {
                JSONResultView(value: result)
            }
        }
        .padding(.vertical, 4)
    }

    private func run() {
        let body = request()
        loading = true
        errorText = nil
        Task {
            do {
                let response = try await app.client.json("POST", Endpoints.ai(task), body: .object(body))
                let value = response["result"] ?? response
                result = value
                onResult?(value)
            } catch {
                errorText = AIErrorText.message(error)
            }
            loading = false
        }
    }
}

/// A red banner with a retry button, for loading failures (there is no offline mode).
struct ErrorBanner: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        HStack {
            Image(systemName: "wifi.exclamationmark")
            Text(message).font(.footnote)
            Spacer()
            if let retry { Button("Retry", action: retry).font(.footnote.bold()) }
        }
        .padding(10)
        .background(Color.red.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
        .foregroundStyle(.red)
    }
}

/// Library or camera photo: shown locally right away, resized to a 1568 px JPEG and uploaded; binds the file_key.
struct PhotoField: View {
    @EnvironmentObject private var app: AppState
    @Binding var fileKey: String?
    @State private var item: PhotosPickerItem?
    @State private var preview: UIImage?
    @State private var showCamera = false
    @State private var uploading = false
    @State private var errorText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 16) {
                PhotosPicker(selection: $item, matching: .images) {
                    Label("Photo library", systemImage: "photo")
                }
                if CameraPicker.isAvailable {
                    Button {
                        showCamera = true
                    } label: {
                        Label("Camera", systemImage: "camera")
                    }
                }
                if uploading { ProgressView() }
            }
            .buttonStyle(.borderless)
            if let preview {
                Image(uiImage: preview)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 180)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel("Selected photo")
            }
            if let errorText {
                Text(errorText).font(.footnote).foregroundStyle(.red)
            }
        }
        .onChange(of: item) { _, newItem in
            Task { await load(newItem) }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                Task { await upload(image) }
            }
            .ignoresSafeArea()
        }
    }

    private func load(_ newItem: PhotosPickerItem?) async {
        guard let newItem, let data = try? await newItem.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else { return }
        await upload(image)
    }

    private func upload(_ image: UIImage) async {
        preview = image
        guard let jpeg = ImageResizer.jpeg(from: image) else {
            errorText = "This photo could not be read."
            return
        }
        uploading = true
        do {
            fileKey = try await app.client.uploadJPEG(jpeg).fileKey
            errorText = nil
        } catch {
            fileKey = nil
            errorText = "Photo upload failed. You can save without a photo."
        }
        uploading = false
    }
}

/// Small helpers for form fields.
enum Num {
    static func value(_ text: String) -> JSONValue {
        let cleaned = text.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
        return Double(cleaned).map { .number($0) } ?? .null
    }

    static func text(_ number: Double?) -> String {
        guard let number else { return "" }
        return number == number.rounded() ? String(Int(number)) : String(format: "%.1f", number)
    }
}

/// Full-width save button with a spinner.
struct SaveButton: View {
    let title: String
    let saving: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Spacer()
                if saving { ProgressView() } else { Text(title).bold() }
                Spacer()
            }
        }
        .disabled(saving)
    }
}
