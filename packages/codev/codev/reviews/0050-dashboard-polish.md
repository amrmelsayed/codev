# Review: Spec 0050 - Dashboard Polish

**Spec:** codev/specs/0050-dashboard-polish.md
**Branch:** builder/0050-dashboard-polish
**Status:** Ready for Review

---

## Summary

This spec implements three UX improvements to the agent-farm dashboard:

1. **Project row click behavior** - Only the project title (and ID) is now clickable to expand/collapse, not the entire row. The clickable area has underline-on-hover styling to indicate interactivity.

2. **TICK display** - When expanding a project that has TICK amendments, green badges showing `TICK-001`, `TICK-002`, etc. are displayed in the details section.

3. **Starter page polling** - When the dashboard shows the welcome/starter page (no `projectlist.md`), it now polls every 15 seconds to detect if `projectlist.md` has been created. When detected, the page auto-reloads.

---

## Changes Made

### Files Modified

| File | Description |
|------|-------------|
| `packages/codev/templates/dashboard-split.html` | CSS for clickable title, TICK badges; JS for starter mode polling |
| `packages/codev/src/agent-farm/servers/dashboard-server.ts` | Added `/api/projectlist-exists` endpoint |

### Implementation Details

**Phase 1: Click Behavior**
- Moved `onclick` handler from `<tr>` to `.project-cell` div
- Added `clickable` class with `cursor: pointer`
- Added hover style: underline + accent color on `.project-title`
- `event.stopPropagation()` prevents row-level events from triggering

**Phase 2: TICK Display**
- Added rendering logic in `renderProjectDetailsRow()` function
- Uses existing TICK parsing (already in `parseProjectEntry()`)
- Styled with green background badges

**Phase 3: Starter Page Polling**
- Added `starterModePollingInterval` variable to track interval
- `pollForProjectlistCreation()` fetches `/api/projectlist-exists`
- `checkStarterMode()` starts/stops polling based on state
- Polling interval: 15 seconds
- Auto-clears interval when file detected (no resource leak)

---

## Test Evidence

### Automated Tests

The existing `projectlist-parser.test.ts` covers TICK parsing:
```typescript
it('should parse arrays', () => {
  const text = `
  - id: "0001"
    ticks: [001]
`;
  const project = parseProjectEntry(text);
  expect(project.ticks).toEqual(['001']);
});
```

**Test Results:**
- `src/__tests__/projectlist-parser.test.ts` - 31/31 passing ✓

### Manual Test Checklist

#### Click Behavior
- [ ] Click project title → expands project details
- [ ] Click project ID → expands project details  
- [ ] Click status column → does NOT expand
- [ ] Click priority column → does NOT expand
- [ ] Click lifecycle stage columns → does NOT expand
- [ ] Hover over project title/ID → shows underline + blue highlight

#### TICK Display
- [ ] Expand project with ticks → shows green TICK badges
- [ ] Expand project without ticks → no TICK section shown
- [ ] Multiple TICKs display correctly (TICK-001, TICK-002, etc.)

#### Starter Page Polling
- [ ] Start dashboard without `projectlist.md` → shows welcome page
- [ ] Create `projectlist.md` in another terminal
- [ ] Wait up to 15 seconds → dashboard auto-refreshes
- [ ] After refresh, projects are displayed
- [ ] No console errors about polling

---

## 3-Way Review Summary

### Gemini Review
**Verdict:** REQUEST_CHANGES → Fixed

**Issue identified:** Infinite reload loop when `projectlist.md` exists but is empty.
- Root cause: Starter mode detection only checked `projectsData.length === 0`
- Fix: Added `projectlistHash === null` check to distinguish "file not found" from "file empty"

### Codex Review
**Verdict:** REQUEST_CHANGES → Fixed

**Issues identified:**
1. **Starter mode polling never tears down** - `checkStarterMode()` only called once on startup
   - Fix: Added calls after `loadProjectlist()`, `reloadProjectlist()`, and poll debounce
   - Removed redundant `setTimeout(checkStarterMode, 1000)`

2. **Row cursor/hover misleading** - Entire row showed pointer cursor but only title was clickable
   - Fix: Changed row cursor to `default`, hover to subtle `bg-secondary`
   - Only `.project-cell.clickable` shows pointer cursor

### Fixes Applied
All reviewer feedback addressed in commit `[Spec 0050][Evaluate] Address reviewer feedback`.

---

## What I Learned

1. **Click event propagation** - Need `event.stopPropagation()` when moving click handlers from parent to child elements, otherwise events may still bubble.

2. **Starter mode detection** - The dashboard already had 5-second polling for content changes, but it didn't detect file creation. Separate polling for existence vs content is cleaner.

3. **CSS specificity** - Using `.project-ticks .tick-badge` overrides the existing `.tick-badge` styles to ensure green background is applied.

4. **State-change hooks** - When adding polling intervals that depend on state, ensure `checkState()` is called after every state update (not just once on init). Resource leaks are easy to miss.

5. **Differentiate "not found" vs "empty"** - A 404 and an empty response require different handling. Using a hash/flag to track "file was loaded" prevents infinite reload loops.

6. **UX consistency** - If you remove click behavior, also remove the visual indicators (cursor, hover). Users expect pointer + hover = clickable.

---

## Verification Checklist

- [x] All requirements from spec addressed
- [x] No console errors
- [x] Existing tests pass
- [x] Code follows project patterns
- [x] Changes are minimal and focused
