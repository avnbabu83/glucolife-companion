import SwiftUI

/// Joins the non-empty parts with " · " (row captions such as "2025-03-01 · 08:00").
func joinParts(_ parts: String?...) -> String {
    parts.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
}

/// A Picker over (value, label) pairs.
struct OptionPicker: View {
    let title: String
    @Binding var selection: String
    let options: [(String, String)]

    init(_ title: String, _ selection: Binding<String>, _ options: [(String, String)]) {
        self.title = title
        self._selection = selection
        self.options = options
    }

    var body: some View {
        Picker(title, selection: $selection) {
            ForEach(0..<options.count, id: \.self) { index in
                Text(options[index].1).tag(options[index].0)
            }
        }
    }

    static func label(_ value: String?, in options: [(String, String)]) -> String {
        guard let value else { return "" }
        return options.first(where: { $0.0 == value })?.1 ?? value.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

/// Recent rows of one entity: tap to edit, swipe to delete. Reloads whenever app data changes.
struct RecentRowsSection: View {
    @EnvironmentObject private var app: AppState
    let title: String
    let entity: Entity
    var sort = "-created_at"
    var limit = 20
    var filters: [String: String] = [:]
    let label: (Row) -> String
    let detail: (Row) -> String
    var onSelect: ((Row) -> Void)?

    @State private var rows: [Row] = []
    @State private var errorText: String?
    @State private var loaded = false

    var body: some View {
        Section(title) {
            if let errorText {
                ErrorBanner(message: errorText) { Task { await load() } }
            } else if loaded && rows.isEmpty {
                Text("Nothing logged yet").foregroundStyle(.secondary)
            }
            ForEach(rows) { row in
                Button {
                    onSelect?(row)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label(row))
                        Text(detail(row)).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .foregroundStyle(.primary)
                .disabled(onSelect == nil)
            }
            .onDelete { offsets in
                let doomed = offsets.map { rows[$0] }
                Task {
                    for row in doomed {
                        do {
                            try await app.delete(entity, row: row)
                        } catch {
                            errorText = app.message(for: error)
                        }
                    }
                }
            }
        }
        .task(id: app.dataVersion) { await load() }
    }

    private func load() async {
        do {
            rows = try await app.entities.list(entity, sort: sort, limit: limit, filters: filters)
            errorText = nil
        } catch {
            errorText = app.message(for: error)
        }
        loaded = true
    }
}

/// Save / cancel-edit rows and the error line shared by the log forms.
struct FormActions: View {
    let isEditing: Bool
    let saving: Bool
    let errorText: String?
    let save: () -> Void
    let cancel: () -> Void

    var body: some View {
        Section {
            if let errorText { Text(errorText).foregroundStyle(.red) }
            SaveButton(title: isEditing ? "Save changes" : "Save", saving: saving, action: save)
                .accessibilityIdentifier("form-save")
            if isEditing { Button("Cancel editing", role: .cancel, action: cancel) }
        }
    }
}
