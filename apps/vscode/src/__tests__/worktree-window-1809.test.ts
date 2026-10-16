/**
 * #1809: worktree-window behaviour that is not about the connection itself.
 *
 * - The dev target comes from the window root, so a worktree window still runs
 *   dev for its own builder even though its Tower workspace path is the parent.
 * - Activity hooks are suppressed in a worktree window: every event would carry
 *   the parent root and misreport the main workspace as focused.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn(async () => true) }));

vi.mock('vscode', () => ({
  window: { showWarningMessage: vi.fn(), showErrorMessage: vi.fn() },
  workspace: { isTrusted: true },
  env: { openExternal },
  Uri: { parse: (url: string) => ({ toString: () => url }) },
}));

const { resolveWorkspaceDevTarget } = await import('../commands/dev-shared.js');
const { fireActivity, setActivityHooks, setActivityHooksSuppressed } = await import('../activity-hooks.js');

describe('resolveWorkspaceDevTarget', () => {
  it('targets the builder for a worktree window root', () => {
    expect(resolveWorkspaceDevTarget('/repo/.builders/pir-1809')).toEqual({
      id: 'pir-1809',
      cwd: '/repo/.builders/pir-1809',
      name: 'pir-1809',
    });
  });

  it('targets main for a workspace root', () => {
    expect(resolveWorkspaceDevTarget('/repo')).toEqual({ id: 'main', cwd: '/repo', name: 'Workspace' });
  });
});

describe('activity hooks in a builder-worktree window', () => {
  beforeEach(() => {
    openExternal.mockClear();
    setActivityHooks([{ on: ['window-focus'], url: 'app://x/focus?workspace={workspace}' }]);
  });

  it('fires nothing while suppressed', () => {
    setActivityHooksSuppressed(true);
    fireActivity('/repo', 'window-focus');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('fires normally in a workspace-root window', () => {
    setActivityHooksSuppressed(false);
    fireActivity('/repo', 'window-focus');
    expect(openExternal).toHaveBeenCalledTimes(1);
  });
});
