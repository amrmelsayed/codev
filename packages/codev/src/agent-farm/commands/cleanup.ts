/**
 * Cleanup command - removes builder worktrees and branches
 */

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Builder, Config } from '../types.js';
import { getConfig } from '../utils/index.js';
import { logger, fatal } from '../utils/logger.js';
import { run } from '../utils/shell.js';
import { loadState, removeBuilder } from '../state.js';

/**
 * Get a namespaced tmux session name: builder-{project}-{id}
 */
function getSessionName(config: Config, builderId: string): string {
  return `builder-${basename(config.projectRoot)}-${builderId}`;
}

export interface CleanupOptions {
  project: string;
  force?: boolean;
}

/**
 * Check if a worktree has uncommitted changes
 * Returns: dirty (has real changes), scaffoldOnly (only has .builder-* files)
 */
async function hasUncommittedChanges(worktreePath: string): Promise<{ dirty: boolean; scaffoldOnly: boolean; details: string }> {
  if (!existsSync(worktreePath)) {
    return { dirty: false, scaffoldOnly: false, details: '' };
  }

  try {
    // Check for uncommitted changes (staged and unstaged)
    const result = await run('git status --porcelain', { cwd: worktreePath });

    if (result.stdout.trim()) {
      // Count changed files, excluding builder scaffold files
      const scaffoldPattern = /^\?\? \.builder-/;
      const allLines = result.stdout.trim().split('\n').filter(Boolean);
      const nonScaffoldLines = allLines.filter((line) => !scaffoldPattern.test(line));

      if (nonScaffoldLines.length > 0) {
        return {
          dirty: true,
          scaffoldOnly: false,
          details: `${nonScaffoldLines.length} uncommitted file(s)`,
        };
      }

      // Only scaffold files present
      if (allLines.length > 0) {
        return { dirty: false, scaffoldOnly: true, details: '' };
      }
    }

    return { dirty: false, scaffoldOnly: false, details: '' };
  } catch {
    // If git status fails, assume dirty to be safe
    return { dirty: true, scaffoldOnly: false, details: 'Unable to check status' };
  }
}

/**
 * Cleanup a builder's worktree and branch
 */
export async function cleanup(options: CleanupOptions): Promise<void> {
  const config = getConfig();
  const projectId = options.project;

  // Load state to find the builder
  const state = loadState();
  const builder = state.builders.find((b) => b.id === projectId);

  if (!builder) {
    // Try to find by name pattern
    const byName = state.builders.find((b) => b.name.includes(projectId));
    if (byName) {
      return cleanupBuilder(byName, options.force);
    }
    fatal(`Builder not found for project: ${projectId}`);
  }

  await cleanupBuilder(builder, options.force);
}

async function cleanupBuilder(builder: Builder, force?: boolean): Promise<void> {
  const config = getConfig();
  const isShellMode = builder.type === 'shell';

  logger.header(`Cleaning up ${isShellMode ? 'Shell' : 'Builder'} ${builder.id}`);
  logger.kv('Name', builder.name);
  if (!isShellMode) {
    logger.kv('Worktree', builder.worktree);
    logger.kv('Branch', builder.branch);
  }

  // Check for uncommitted changes (informational - worktree is preserved)
  if (!isShellMode) {
    const { dirty, details } = await hasUncommittedChanges(builder.worktree);
    if (dirty) {
      logger.info(`Worktree has uncommitted changes: ${details}`);
    }
  }

  // Kill ttyd process if running
  if (builder.pid) {
    logger.info('Stopping builder terminal...');
    try {
      process.kill(builder.pid, 'SIGTERM');
    } catch {
      // Process may already be dead
    }
  }

  // Kill tmux session if exists (use stored session name for correct shell/builder naming)
  const sessionName = builder.tmuxSession || getSessionName(config, builder.id);
  try {
    await run(`tmux kill-session -t "${sessionName}" 2>/dev/null`);
    logger.info('Killed tmux session');
  } catch {
    // Session may not exist
  }

  // Note: worktrees are NOT automatically removed - they may contain useful context
  // Users can manually clean up with: git worktree remove <path>
  if (!isShellMode && existsSync(builder.worktree)) {
    logger.info(`Worktree preserved at: ${builder.worktree}`);
    logger.info('To remove: git worktree remove "' + builder.worktree + '"');
  }

  // Note: branches are NOT automatically deleted - they may be needed for reference
  // Users can manually delete with: git branch -d <branch>
  if (!isShellMode && builder.branch) {
    logger.info(`Branch preserved: ${builder.branch}`);
    logger.info('To delete: git branch -d "' + builder.branch + '"');
  }

  // Remove from state
  removeBuilder(builder.id);

  // Always prune stale worktree entries to prevent "can't find session" errors
  // This catches any orphaned worktrees from crashes or manual kills
  if (!isShellMode) {
    try {
      await run('git worktree prune', { cwd: config.projectRoot });
    } catch {
      // Non-fatal - prune is best-effort cleanup
    }
  }

  logger.blank();
  logger.success(`Builder ${builder.id} cleaned up!`);
}
