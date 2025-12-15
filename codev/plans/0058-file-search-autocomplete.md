# Plan 0058: File Search Autocomplete

## Overview

Add file search autocomplete to the dashboard with two entry points:
1. **Cmd+P modal** - VSCode-like palette overlay
2. **Files tab search** - Always-visible search input in the Files column

## Dependencies

- Spec 0055 (Dashboard File Browser) - provides `/api/files` endpoint and tree rendering

## Implementation Phases

### Phase 1: Flatten File List Utility

**Goal:** Create a utility to extract all file paths from the tree data for searching.

**Files to modify:**
- `packages/codev/templates/dashboard-split.html`

**Changes:**
1. Add `flattenFilesTree(nodes)` function that recursively extracts all file paths from the tree
2. Cache the flattened list in `filesTreeFlat` variable (updated when tree loads/refreshes)
3. Call flatten after `loadFilesTree()` completes

**Code sketch:**
```javascript
let filesTreeFlat = []; // Array of {name, path} objects

function flattenFilesTree(nodes, result = []) {
  for (const node of nodes) {
    if (node.type === 'file') {
      result.push({ name: node.name, path: node.path });
    } else if (node.children) {
      flattenFilesTree(node.children, result);
    }
  }
  return result;
}

// Call after tree loads AND after any refresh
async function loadFilesTree() {
  // ... existing fetch logic ...
  filesTreeFlat = flattenFilesTree(filesTreeData); // Re-flatten on every load
}
```

**Important:** The flat list must be regenerated whenever `filesTreeData` changes (initial load AND refresh button).

### Phase 2: Search/Filter Function

**Goal:** Implement substring matching with relevance sorting.

**Files to modify:**
- `packages/codev/templates/dashboard-split.html`

**Changes:**
1. Add `searchFiles(query)` function that filters `filesTreeFlat`
2. Implement case-insensitive substring matching against full path
3. Sort results: exact filename match > filename prefix > path contains
4. Limit results to 15 items

**Code sketch:**
```javascript
function searchFiles(query) {
  if (!query) return [];
  const q = query.toLowerCase();

  const matches = filesTreeFlat.filter(f =>
    f.path.toLowerCase().includes(q)
  );

  // Sort by relevance
  matches.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aPath = a.path.toLowerCase();
    const bPath = b.path.toLowerCase();

    // Exact filename match first
    if (aName === q && bName !== q) return -1;
    if (bName === q && aName !== q) return 1;

    // Filename starts with query
    if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
    if (bName.startsWith(q) && !aName.startsWith(q)) return 1;

    // Filename contains query
    if (aName.includes(q) && !bName.includes(q)) return -1;
    if (bName.includes(q) && !aName.includes(q)) return 1;

    // Alphabetical by path
    return aPath.localeCompare(bPath);
  });

  return matches.slice(0, 15);
}
```

### Phase 3: Files Column Search Input

**Goal:** Add search input to the Files column header.

**Files to modify:**
- `packages/codev/templates/dashboard-split.html`

**Changes:**
1. Add search state: `filesSearchQuery`, `filesSearchResults`, `filesSearchIndex`, `filesSearchDebounceTimer`
2. Update `renderFilesColumnHeader()` to include search input
3. Add `onFilesSearchInput(query)` handler with **100ms debounce**
4. Render search results instead of tree when query is active
5. When query is cleared, restore original tree view (preserve expand/collapse state)
6. Add keyboard handlers (Arrow Up/Down, Enter, Escape)
7. Show/hide clear button based on whether input has value

**UI structure:**
```html
<div class="files-header">
  <span class="column-title">Files</span>
  <div class="files-search-container">
    <input type="text"
           id="files-search-input"
           class="files-search-input"
           placeholder="Search files by name..."
           oninput="onFilesSearchInput(this.value)"
           onkeydown="onFilesSearchKeydown(event)" />
    <button class="files-search-clear ${query ? '' : 'hidden'}" onclick="clearFilesSearch()">×</button>
  </div>
  <div class="files-header-actions">...</div>
</div>
```

**Debounce implementation:**
```javascript
let filesSearchDebounceTimer = null;

function onFilesSearchInput(value) {
  clearTimeout(filesSearchDebounceTimer);
  filesSearchDebounceTimer = setTimeout(() => {
    filesSearchQuery = value;
    filesSearchResults = searchFiles(value);
    filesSearchIndex = 0;
    rerenderFilesSearch();
  }, 100);
}
```

**Styles to add:**
```css
.files-search-container { display: flex; margin: 8px 0; }
.files-search-input { flex: 1; background: #1a1a1a; border: 1px solid #444; ... }
.files-search-clear { display: none; } /* Show when query present */
.files-search-result { padding: 6px 12px; cursor: pointer; }
.files-search-result:hover, .files-search-result.selected { background: #3a3a3a; }
.files-search-highlight { color: #3b82f6; font-weight: 500; }
```

### Phase 4: Cmd+P Modal Palette

**Goal:** Add keyboard-activated search modal.

**Files to modify:**
- `packages/codev/templates/dashboard-split.html`

**Changes:**
1. Add modal HTML structure (hidden by default)
2. Add global keydown listener for Cmd+P / Ctrl+P with guardrails
3. Add modal state: `paletteOpen`, `paletteQuery`, `paletteResults`, `paletteIndex`, `paletteDebounceTimer`
4. Implement `openPalette()`, `closePalette()`, `onPaletteInput()`, `onPaletteKeydown()`
5. **Auto-focus** the input when palette opens
6. **Debounce** input (100ms) same as Files tab
7. Reuse `searchFiles()` from Phase 2

**Global keyboard handler with guardrails:**
```javascript
document.addEventListener('keydown', (e) => {
  // Cmd+P (macOS) or Ctrl+P (Windows/Linux)
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
    // Skip if user is typing in an input/textarea (except our search inputs)
    const active = document.activeElement;
    const isOurInput = active?.id === 'palette-input' || active?.id === 'files-search-input';
    const isEditable = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;

    if (!isOurInput && isEditable) return; // Let native behavior happen

    e.preventDefault(); // Prevent browser Print dialog
    openPalette();
  }
});
```

**Modal HTML:**
```html
<div id="file-palette" class="file-palette hidden">
  <div class="file-palette-backdrop" onclick="closePalette()"></div>
  <div class="file-palette-container">
    <input type="text"
           id="palette-input"
           class="file-palette-input"
           placeholder="Search files by name..."
           oninput="onPaletteInput(this.value)"
           onkeydown="onPaletteKeydown(event)" />
    <div id="palette-results" class="file-palette-results"></div>
  </div>
</div>
```

**Open with auto-focus:**
```javascript
function openPalette() {
  paletteOpen = true;
  paletteQuery = '';
  paletteResults = [];
  paletteIndex = 0;
  document.getElementById('file-palette').classList.remove('hidden');
  const input = document.getElementById('palette-input');
  input.value = '';
  input.focus(); // Auto-focus so user can type immediately
  rerenderPaletteResults();
}
```

**Debounced input handler:**
```javascript
let paletteDebounceTimer = null;

function onPaletteInput(value) {
  clearTimeout(paletteDebounceTimer);
  paletteDebounceTimer = setTimeout(() => {
    paletteQuery = value;
    paletteResults = searchFiles(value);
    paletteIndex = 0;
    rerenderPaletteResults();
  }, 100);
}
```

**Styles:**
```css
.file-palette { position: fixed; inset: 0; z-index: 1000; }
.file-palette.hidden { display: none; }
.file-palette-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
.file-palette-container {
  position: absolute; top: 80px; left: 50%; transform: translateX(-50%);
  width: 500px; max-width: 90vw; background: #2a2a2a;
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.file-palette-input { width: 100%; padding: 12px 16px; ... }
.file-palette-results { max-height: 400px; overflow-y: auto; }
```

### Phase 5: Result Rendering with Highlights

**Goal:** Render search results with highlighted match portions.

**Files to modify:**
- `packages/codev/templates/dashboard-split.html`

**Changes:**
1. Add `highlightMatch(text, query)` function
2. Add `renderSearchResult(file, index, isSelected)` function
3. Use in both Files column and palette

**Code sketch:**
```javascript
function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx === -1) return escapeHtml(text);

  return escapeHtml(text.substring(0, idx)) +
         '<span class="files-search-highlight">' + escapeHtml(text.substring(idx, idx + query.length)) + '</span>' +
         escapeHtml(text.substring(idx + query.length));
}

function renderSearchResult(file, index, isSelected, query) {
  return `
    <div class="files-search-result ${isSelected ? 'selected' : ''}"
         data-index="${index}"
         onclick="openFileFromSearch('${escapeJsString(file.path)}')">
      <div class="search-result-name">${highlightMatch(file.name, query)}</div>
      <div class="search-result-path">${highlightMatch(file.path, query)}</div>
    </div>
  `;
}
```

### Phase 6: Keyboard Navigation

**Goal:** Arrow key navigation and Enter to open.

**Files to modify:**
- `packages/codev/templates/dashboard-split.html`

**Changes:**
1. Track selected index in both Files search and palette
2. Handle ArrowUp, ArrowDown, Enter, Escape
3. Scroll selected item into view
4. Open file on Enter, close on Escape

**Code sketch:**
```javascript
function onFilesSearchKeydown(event) {
  const results = filesSearchResults;
  if (!results.length) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    filesSearchIndex = Math.min(filesSearchIndex + 1, results.length - 1);
    rerenderFilesSearch();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    filesSearchIndex = Math.max(filesSearchIndex - 1, 0);
    rerenderFilesSearch();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (results[filesSearchIndex]) {
      openFileFromSearch(results[filesSearchIndex].path);
    }
  } else if (event.key === 'Escape') {
    clearFilesSearch();
  }
}
```

### Phase 7: Focus Existing Tab

**Goal:** If file is already open, focus that tab instead of opening a new one.

**Files to modify:**
- `packages/codev/templates/dashboard-split.html`

**Changes:**
1. Modify `openFileFromSearch(path)` to check if tab already exists
2. If exists, call `selectTab(existingTabId)` instead of opening new

**Code sketch:**
```javascript
function openFileFromSearch(filePath) {
  // Check if file is already open
  const existingTab = tabs.find(t => t.type === 'file' && t.path === filePath);
  if (existingTab) {
    selectTab(existingTab.id);
  } else {
    openFileFromTree(filePath);
  }

  // Close search/palette
  clearFilesSearch();
  closePalette();
}
```

## Testing Checklist

**Activation:**
- [ ] Cmd+P opens modal palette on macOS
- [ ] Ctrl+P opens modal palette on Windows/Linux
- [ ] Ctrl+P does NOT open browser Print dialog
- [ ] Cmd/Ctrl+P ignored when typing in other inputs (e.g., terminal)
- [ ] Files column shows search input with placeholder "Search files by name..."
- [ ] Palette input auto-focuses when opened

**Search behavior:**
- [ ] Typing filters files with substring matching (debounced 100ms)
- [ ] Results highlight matched portions
- [ ] Results sorted by relevance (exact > prefix > substring)
- [ ] Empty query shows no results / restores tree view
- [ ] Search respects same exclusions as Files tab (node_modules, .git, etc.)

**Navigation:**
- [ ] Arrow keys navigate results
- [ ] Enter opens selected file
- [ ] Escape closes search/palette
- [ ] Clear button (x) resets search and restores tree

**File opening:**
- [ ] Already-open files focus existing tab (no duplicate)
- [ ] New files open in annotation viewer

**Performance:**
- [ ] Responsive with 1,000+ files
- [ ] No visible lag when typing quickly
- [ ] Cache refreshes after Files tree refresh button

**Edge cases:**
- [ ] Long file paths display correctly (truncated or scrollable)
- [ ] Special characters in filenames handled correctly

## Files Changed Summary

| File | Changes |
|------|---------|
| `packages/codev/templates/dashboard-split.html` | All JavaScript and CSS additions |

## Estimated Scope

- ~250 lines of JavaScript (including debounce, guardrails, auto-focus)
- ~100 lines of CSS
- Single file modification (dashboard-split.html)
