/**
 * Issue-id helpers for the dashboard (#1740): ids are bare numbers (GitHub,
 * GitLab, Gitea) or tracker keys (Jira, Linear: `ENG-123`).
 *
 * Sync note: twins `issueRef` in apps/vscode/src/issue-id.ts.
 */

import type { Builder, OverviewBuilder } from './api.js';

/**
 * How an issue id reads in labels: `#42` for numbers (and any non-key id, as
 * before), `ENG-123` for a canonical tracker key, which is never written with
 * a `#`.
 */
export function issueRef(id: string): string {
  if (/^[A-Z][A-Z0-9_]*-\d+$/.test(id)) { return id; }
  return `#${id}`;
}

/**
 * The terminal tab for an overview builder. The overview's `roleId` is the
 * terminal's id, so an exact (case-insensitive) match comes first. The older
 * substring match is the fallback for a Tower that sends no roleId; it compares
 * case-insensitively because terminal ids are lower-case while tracker keys
 * arrive upper-case (`ENG-123` vs `builder-pir-eng-123`).
 */
export function findBuilderTab(builder: OverviewBuilder, tabs: Builder[] | undefined): Builder | undefined {
  if (!tabs) { return undefined; }
  const role = builder.roleId?.toLowerCase();
  if (role) {
    const exact = tabs.find(t => t.id?.toLowerCase() === role);
    if (exact) { return exact; }
  }
  const needle = (builder.issueId ?? builder.id).toLowerCase();
  return tabs.find(t => t.name?.toLowerCase().includes(needle) || t.id?.toLowerCase().includes(needle));
}
