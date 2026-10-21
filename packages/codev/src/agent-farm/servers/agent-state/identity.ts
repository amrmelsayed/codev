/**
 * Resolve a lifecycle report's launch identity to the agent Tower knows
 * (Spec 1595, Constraint 15).
 *
 * The reporter names its agent with the identity codev injected at launch: a
 * builder by its worktree path, an architect by name plus workspace path. Tower
 * normalizes every path before the registry lookup, so a differently spelled path
 * to the same agent (a symlink, a trailing slash, a relative segment; #1809)
 * resolves to the same row, and the id it returns is always its own canonical one,
 * never the raw reported identity:
 *
 * - a builder: the shared worktree row matcher (`afx send`'s lookup), then the
 *   lowercased role id the overview derives for that row (`builderRoleId`);
 * - an architect: its row in the workspace's registered architects.
 *
 * It never throws. An unknown agent, an unreadable registry, or a path outside
 * any builder worktree all resolve to `null`, which the route rejects.
 *
 * Ingestion fires per tool call, so lookups use Tower's own `global.db` handle
 * behind a short-lived memo of successful resolutions. Misses are never memoized,
 * so a newly spawned agent resolves on its first report; a removed agent stops
 * resolving within `IDENTITY_MEMO_TTL_MS`, or at once after
 * `invalidateAgentIdentityMemo`.
 */

import type Database from 'better-sqlite3';
import type { AgentLaunchIdentity } from '@cluesmith/codev-types';
import { getGlobalDb } from '../../db/index.js';
import { normalizeWorkspacePath } from '../../utils/workspace-path.js';
import {
  matchBuilderRow,
  parseBuilderWorktreePath,
  type BuilderWorktreeRow,
} from '../../utils/builder-worktree-identity.js';
import { builderRoleId } from '../overview.js';

/** How long a successful resolution is reused before the registry is read again. */
export const IDENTITY_MEMO_TTL_MS = 5_000;

/** A resolved agent: the store key. */
export interface ResolvedAgent {
  /** The agent's workspace, normalized. */
  workspacePath: string;
  /** Tower's canonical id: a builder's lowercased role id, or an architect's name. */
  agentId: string;
}

export interface ResolveAgentIdentityOptions {
  /** The registry handle. Defaults to Tower's `getGlobalDb()`. */
  db?: () => Database.Database;
  now?: () => number;
}

const memo = new Map<string, { agent: ResolvedAgent; expiresAt: number }>();

/** Drop every memoized resolution (the builders or architects registry changed). */
export function invalidateAgentIdentityMemo(): void {
  memo.clear();
}

function resolveBuilder(db: Database.Database, worktreePath: string): ResolvedAgent | null {
  const ref = parseBuilderWorktreePath(normalizeWorkspacePath(worktreePath));
  if (!ref) return null;
  const workspacePath = normalizeWorkspacePath(ref.workspacePath);
  const rows = db
    .prepare('SELECT id, worktree FROM builders WHERE workspace_path = ? AND worktree IS NOT NULL')
    .all(workspacePath) as BuilderWorktreeRow[];
  const row = matchBuilderRow(rows, ref);
  if (!row) return null;
  const agentId = builderRoleId(row.id, ref.worktreeDirName);
  if (agentId === null) return null;
  return { workspacePath, agentId };
}

function resolveArchitect(db: Database.Database, workspacePath: string, name: string): ResolvedAgent | null {
  const normalized = normalizeWorkspacePath(workspacePath);
  const row = db
    .prepare('SELECT id FROM architect WHERE workspace_path = ? AND id = ?')
    .get(normalized, name) as { id: string } | undefined;
  if (!row) return null;
  return { workspacePath: normalized, agentId: row.id };
}

/**
 * The agent a launch identity names, or `null` when Tower does not know it.
 * Never throws.
 */
export function resolveAgentIdentity(
  identity: AgentLaunchIdentity,
  options: ResolveAgentIdentityOptions = {},
): ResolvedAgent | null {
  const now = options.now ?? Date.now;
  try {
    let memoKey: string;
    if (identity.kind === 'builder') {
      memoKey = `builder\0${normalizeWorkspacePath(identity.worktreePath)}`;
    } else {
      memoKey = `architect\0${normalizeWorkspacePath(identity.workspacePath)}\0${identity.name}`;
    }
    const cached = memo.get(memoKey);
    if (cached !== undefined && cached.expiresAt > now()) return cached.agent;

    const db = (options.db ?? getGlobalDb)();
    let agent: ResolvedAgent | null;
    if (identity.kind === 'builder') {
      agent = resolveBuilder(db, identity.worktreePath);
    } else {
      agent = resolveArchitect(db, identity.workspacePath, identity.name);
    }
    if (agent === null) {
      memo.delete(memoKey);
      return null;
    }
    memo.set(memoKey, { agent, expiresAt: now() + IDENTITY_MEMO_TTL_MS });
    return agent;
  } catch {
    return null;
  }
}
