/**
 * Issue #1740: which VS Code surfaces accept tracker-key issue ids (`ENG-123`),
 * from Tower's `issueIdKind`, with a per-surface fallback when it is unknown.
 */

import { describe, it, expect } from 'vitest';
import type { OverviewBacklogItem } from '@cluesmith/codev-types';
import { acceptsIssueKeys, isIssueKey } from '../issue-id.js';

const item = (id: string) => ({ id } as unknown as OverviewBacklogItem);

describe('isIssueKey (twin of the codev-side grammar)', () => {
  it('accepts tracker keys and rejects numbers and junk', () => {
    for (const k of ['ENG-123', 'AB2-12', 'MY_PROJ-1', 'eng-1']) expect(isIssueKey(k), k).toBe(true);
    for (const k of ['42', 'ENG-', '2AB-1', 'UTF 8', '#ENG-1']) expect(isIssueKey(k), k).toBe(false);
  });
});

describe('acceptsIssueKeys', () => {
  it("'number' rejects keys on every surface (GitHub/GitLab/Gitea unchanged)", () => {
    const data = { issueIdKind: 'number' as const, backlog: [item('ENG-1')] };
    expect(acceptsIssueKeys(data, 'explicit')).toBe(false);
    expect(acceptsIssueKeys(data, 'passive')).toBe(false);
  });

  it("'key' accepts keys on every surface, even with an empty backlog", () => {
    const data = { issueIdKind: 'key' as const, backlog: [] };
    expect(acceptsIssueKeys(data, 'explicit')).toBe(true);
    expect(acceptsIssueKeys(data, 'passive')).toBe(true);
  });

  it('unknown kind: the explicit action accepts keys, even before the overview loads', () => {
    expect(acceptsIssueKeys(null, 'explicit')).toBe(true);
    expect(acceptsIssueKeys({ backlog: [] }, 'explicit')).toBe(true);
    expect(acceptsIssueKeys({ backlog: [item('42')] }, 'explicit')).toBe(true);
  });

  it('unknown kind: passive rows fall back to the backlog, numeric-only when it is empty or unloaded', () => {
    expect(acceptsIssueKeys(null, 'passive')).toBe(false);
    expect(acceptsIssueKeys({ backlog: [] }, 'passive')).toBe(false);
    expect(acceptsIssueKeys({ backlog: [item('42')] }, 'passive')).toBe(false);
    expect(acceptsIssueKeys({ backlog: [item('ENG-1')] }, 'passive')).toBe(true);
  });
});
