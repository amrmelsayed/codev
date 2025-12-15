# Review: Spec 0057 - Dashboard Tab Overhaul

## Summary

This spec overhauled the "Projects" tab into a "Dashboard" tab with improved UX. The key changes include:

1. **Two-column layout**: Tabs list on the left, file browser on the right
2. **Quick action buttons**: "+ New Shell" and "+ New Worktree" for faster workflows
3. **Status indicators**: Visual indication of builder status (working/idle/blocked)
4. **Backend worktree support**: Create isolated worktrees directly from the dashboard

## Implementation Details

### Files Changed

1. `packages/codev/templates/dashboard-split.html`
   - Renamed tab from "Projects" to "Dashboard"
   - Added two-column grid layout with responsive breakpoint (900px)
   - Implemented `renderDashboardTabsList()` for tabs with status indicators
   - Reused existing `renderTreeNodes()` for compact file browser
   - Added `createNewShell()` and `createNewWorktreeShell()` functions
   - Removed welcome page from default view

2. `packages/codev/src/agent-farm/servers/dashboard-server.ts`
   - Extended `/api/tabs/shell` endpoint to accept `worktree` and `branch` parameters
   - Implemented worktree creation in `.worktrees/` directory
   - Added branch validation (reject unsafe characters, support dots)
   - Support both new branch creation (`-b`) and existing branch checkout

3. `tests/e2e/dashboard.bats`
   - Added tests for dashboard template structure
   - Tests for worktree API support
   - Tests for responsive design and accessibility

## Review Feedback Addressed

### Gemini (APPROVE)
- No issues identified

### Codex (REQUEST_CHANGES - addressed)
1. **Existing branches**: Now checks if branch exists before deciding to use `-b` flag
2. **Branch validation**: Relaxed to allow dots (e.g., `release/1.2.0`)
3. **Auto-select tab**: Worktree quick action now calls `selectTab()` after creation

## Lessons Learned

1. **Always handle both new and existing branches**: When creating worktrees, users often want to work on existing branches, not just new ones.

2. **Follow git's branch naming rules**: Don't be more restrictive than git itself. Use pattern-based rejection (control chars, `..`, etc.) rather than whitelist.

3. **Consistency in UX**: Quick actions should behave consistently - both shell and worktree buttons now auto-select the created tab.

4. **File browser reuse**: The existing `renderTreeNodes()` function was flexible enough to reuse in the dashboard without modification.

## Testing

- TypeScript compilation: Pass
- Existing tests: Pass (40/41)
- New dashboard.bats tests: Structure tests pass

## Next Steps

- Consider adding runtime tests that actually start the dashboard server
- Consider adding keyboard shortcuts for quick actions
- Consider showing worktree path in tab tooltip
