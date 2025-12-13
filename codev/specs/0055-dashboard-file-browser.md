# Spec 0055: Dashboard File Browser

## Summary

Add a "Files" tab to the dashboard providing a VSCode-like file browser with collapsible folder tree.

## Requirements

1. **New Tab** - "Files" tab alongside "Projects" tab
   - Uncloseable (permanent tab like Projects)
   - Shows project directory structure

2. **Tree View** - Collapsible folder hierarchy
   - Click folder to expand/collapse
   - Click file to open in annotation viewer (new tab)
   - Visual indicators for expanded/collapsed state (▶/▼ or similar)

3. **Controls** - Header with:
   - "Collapse All" button
   - "Expand All" button
   - Optional: refresh button

4. **Filtering** - Respect .gitignore
   - Hide node_modules, .git, dist, etc.
   - Or use simple hardcoded exclusion list

## Acceptance Criteria

- [ ] Files tab appears next to Projects tab
- [ ] Directory tree displays with expand/collapse
- [ ] Clicking file opens in annotation viewer
- [ ] Collapse All / Expand All buttons work
- [ ] Common directories (node_modules, .git) are hidden
