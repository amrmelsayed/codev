# pir-1809 thread

## 2026-10-13 plan phase
- Architect is `vscode` (not main). Tower + sdk plan sections (A, B, C) route to main before plan-approval.
- Decision recommended: worktree window ATTACHES READ-ONLY to parent root (no activate, no Tower auto-start). Keeps dev controls (dev PTY under parent = single-slot swap works; picks up gitignored config.local.json) and canvas registration; preview review comments are local markers either way.
- Defaults flagged for owner: suppress activity hooks in worktree windows; trim Workspace view to Dev/Dev URL/Dashboard there.
- Agents view clause chosen as `!codev.isBuilderWorktree` (not `hasWorkspace && ...`) so empty-window onboarding welcome survives.
- Cleanup = Tower startup prune pass after reconcile (liveness-aware), not a global.db migration (migrations run before liveness is known). Live stray architects are WARN-reported, never killed.
- Found: boot reconcile re-registers known_workspaces for reattached live worktree architects (tower-terminals.ts:894); registerKnownWorkspace gets a worktree no-op guard.
