/**
 * Issue #1740: `--resume` must find a tracker-key builder's worktree whatever
 * case it was spawned in. Spawn now canonicalizes keys to upper case, so a
 * builder spawned earlier as `eng-123` lives in `bugfix-eng-123-slug`; on a
 * case-sensitive filesystem a plain startsWith would miss it. Numeric ids keep
 * exact matching.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findExistingIssueWorktree, issueDirName } from '../commands/spawn-worktree.js';

let buildersDir: string;

beforeEach(() => {
  buildersDir = mkdtempSync(join(tmpdir(), 'codev-1740-builders-'));
});

afterEach(() => {
  rmSync(buildersDir, { recursive: true, force: true });
});

describe('findExistingIssueWorktree with tracker keys (#1740)', () => {
  it('finds a lower-case legacy worktree by its canonical key', () => {
    mkdirSync(join(buildersDir, 'bugfix-eng-123-fix-login'));
    expect(findExistingIssueWorktree(buildersDir, 'bugfix', 'ENG-123')).toBe('bugfix-eng-123-fix-login');
  });

  it('finds a canonical worktree', () => {
    mkdirSync(join(buildersDir, 'pir-ENG-123-slug'));
    expect(findExistingIssueWorktree(buildersDir, 'pir', 'ENG-123')).toBe('pir-ENG-123-slug');
  });

  it('does not match a longer key with the same prefix', () => {
    mkdirSync(join(buildersDir, 'bugfix-ENG-1234-other'));
    expect(findExistingIssueWorktree(buildersDir, 'bugfix', 'ENG-123')).toBeNull();
  });

  it('keeps numeric ids exact', () => {
    mkdirSync(join(buildersDir, 'bugfix-42-slug'));
    expect(findExistingIssueWorktree(buildersDir, 'bugfix', 42)).toBe('bugfix-42-slug');
    expect(findExistingIssueWorktree(buildersDir, 'bugfix', 4)).toBeNull();
  });
});

describe('issueDirName', () => {
  it('folds case only for tracker keys', () => {
    expect(issueDirName('Bugfix-ENG-1-X', 'ENG-1')).toBe('bugfix-eng-1-x');
    expect(issueDirName('Bugfix-42-X', 42)).toBe('Bugfix-42-X');
  });
});
