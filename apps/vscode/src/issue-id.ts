/**
 * Issue identifiers in the extension (#1740): bare numbers (GitHub, GitLab,
 * Gitea) or tracker keys (Jira, Linear: `ENG-123`).
 *
 * Sync note: the key grammar is a twin of `ISSUE_KEY_SOURCE` in
 * packages/codev/src/lib/issue-id.ts (a letter, then letters, digits or
 * underscores, a dash, digits). Change both together.
 *
 * vscode-free so it is unit-testable from the vitest harness.
 */

import type { OverviewData } from '@cluesmith/codev-types';

const ISSUE_KEY = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

/** True for a tracker key such as `ENG-123` (any case). */
export function isIssueKey(value: string): boolean {
  return ISSUE_KEY.test(value);
}

/**
 * Whether a surface should accept key-shaped issue ids, from Tower's
 * `issueIdKind` (#1740):
 *
 * - `'key'` → yes; `'number'` → no (GitHub/GitLab/Gitea stay numeric-only).
 * - Unknown (older Tower, hand-overridden issue concepts, overview not yet
 *   loaded):
 *   - an `explicit` action (the user typed an id into Open Issue by ID) accepts
 *     keys: the worst case is a "could not open" toast, never a valid Jira key
 *     rejected as invalid;
 *   - a `passive` surface (rows offered unasked in the backlog search) offers
 *     keys only when the loaded backlog's ids are keys, so a numeric workspace
 *     never sees a "View Issue UTF-8" row.
 */
export function acceptsIssueKeys(
  data: Pick<OverviewData, 'issueIdKind' | 'backlog'> | null | undefined,
  surface: 'explicit' | 'passive',
): boolean {
  if (data?.issueIdKind === 'key') { return true; }
  if (data?.issueIdKind === 'number') { return false; }
  if (surface === 'explicit') { return true; }
  return !!data?.backlog?.some(item => isIssueKey(item.id));
}

/**
 * How an issue id reads in labels and messages: `#42` for numbers (and any
 * non-key id, as before), `ENG-123` for a canonical tracker key, which is
 * never written with a `#`.
 */
export function issueRef(id: string): string {
  if (/^[A-Z][A-Z0-9_]*-\d+$/.test(id)) { return id; }
  return `#${id}`;
}

/**
 * The id part of a terminal role id, for matching against overview builders:
 * `builder-pir-eng-123` → `eng-123`, `builder-spir-126` → `126`. Splitting on
 * the last `-` instead would turn a key into its digits and match the wrong
 * builder (#1740).
 */
export function roleShortId(roleId: string): string {
  const m = roleId.match(/^builder-[a-z]+-(.+)$/i);
  if (m) { return m[1]; }
  return roleId.split('-').pop() ?? roleId;
}
