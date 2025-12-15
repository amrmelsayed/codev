# Spec 0058: File Search Autocomplete

## Summary

Add a VSCode-like quick file finder (Cmd+P) to the dashboard with autocomplete suggestions as the user types.

## Motivation

The existing Files tab (Spec 0055) provides a tree view for browsing the project directory, but navigating large codebases by expanding folders is slow. A quick file finder lets users jump directly to any file by typing part of its name.

## Requirements

### 1. Activation Methods

**Keyboard shortcut:**
- **Cmd+P** (macOS) / **Ctrl+P** (Windows/Linux) opens the file search palette
- Palette appears as a modal overlay at top-center of the dashboard
- Escape key closes the palette

**Files tab integration:**
- Search input always visible at top of the Files tab
- Clicking the input or typing activates autocomplete
- Results appear inline, replacing/filtering the file tree
- Same autocomplete behavior as the modal palette

### 2. Search Input

- Auto-focused text input when palette opens
- Placeholder text: "Search files by name..."
- Clear button (x) to reset input

### 3. Autocomplete Results

- Results appear as a dropdown list below the input
- Maximum 10-15 visible results with scrolling
- Each result shows:
  - File name (highlighted match portions)
  - Relative path from project root (muted)
- Results update as user types (debounced ~100ms)

### 4. Matching Behavior

- **Substring matching** - query matches anywhere in filename or path
- Match against full path, not just filename
- Case-insensitive by default
- Sort results by relevance (exact match > prefix > substring)

### 5. Keyboard Navigation

- **Arrow Up/Down** - Navigate through results
- **Enter** - Open selected file
- **Escape** - Close palette

### 6. Opening Files

- Selected file opens in annotation viewer (new tab)
- Palette closes after selection
- If file is already open in a tab, focus that tab instead

### 7. Performance

- File list should be cached/indexed on dashboard load
- Respect .gitignore exclusions (same as Files tab)
- Should handle codebases with 10,000+ files smoothly

## Non-Requirements

- Full-text search within files (that's a different feature)
- Regex search support
- Search history/recent files (could be a future enhancement)

## UI Mockup

```
+--------------------------------------------------+
|  [x] Search files by name...                     |
+--------------------------------------------------+
|  dashboard.html                                  |
|  packages/codev/templates/dashboard.html         |
|  ------------------------------------------------|
|  dashboard-server.ts                             |
|  packages/codev/src/agent-farm/servers/          |
|  ------------------------------------------------|
|  tower.html                                      |
|  packages/codev/templates/                       |
+--------------------------------------------------+
```

## Acceptance Criteria

- [ ] Cmd+P / Ctrl+P opens the file search palette
- [ ] Search input visible in Files tab header
- [ ] Typing filters files with substring matching
- [ ] Arrow keys navigate results, Enter opens file
- [ ] Selected file opens in annotation viewer
- [ ] Escape closes the palette
- [ ] Results are sorted by relevance
- [ ] Performance is acceptable with 10,000+ files
- [ ] Respects same file exclusions as Files tab

## Implementation Notes

- Can reuse the existing `/api/files` endpoint from the file browser
- Simple substring matching (case-insensitive) - no fuzzy matching needed
- Debounce input to avoid excessive filtering on large file lists
- Files tab search and Cmd+P modal can share the same filtering logic
