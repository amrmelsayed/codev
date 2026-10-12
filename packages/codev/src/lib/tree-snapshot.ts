/**
 * Before/after snapshots of a working tree, for commands that hand the tree to an agent
 * they cannot sandbox and must report afterwards what moved.
 *
 * Two consumers: the consult tripwire (#1649), which watches a review lane that should
 * write nothing, and `codev bootstrap-docs` (Spec 1797), which watches a drafting agent
 * that may write only the governance files it was given. Each owns its own exemptions;
 * this module only takes the snapshots and diffs them through a caller-supplied predicate.
 *
 * ## Why not just diff `git status --porcelain` output
 *
 * Because the interesting case is a tree that was *already dirty*. A builder mid-phase has
 * uncommitted work; porcelain reports ` M src/foo.ts` before and after, identical strings,
 * while the file's contents changed underneath. So the git snapshot pairs each path
 * porcelain reports with a hash of its contents on disk.
 *
 * ## What it cannot see
 *
 * In a git work tree: files git ignores, edits inside a submodule (`git status` reports the
 * submodule as one entry), and an edit restored byte-for-byte before the second snapshot.
 * Outside git: whatever the walk skips (`.git/`, `node_modules/`) and anything past the
 * walk's file bound, which the snapshot reports as `truncated`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/**
 * Where the repository itself is pointing.
 *
 * The working tree is only half the state an agent can move. `git commit` takes a dirty
 * tree clean, and `git checkout` between two refs with identical content changes nothing a
 * file comparison can see.
 *
 * Either field is `null` when git cannot answer — most usefully in a repository with no
 * commits yet, where `rev-parse HEAD` fails and the tree is still worth watching.
 */
export interface RepositoryIdentity {
  /** HEAD's object id. */
  head: string | null;
  /** Branch name, or `HEAD` when detached. */
  branch: string | null;
}

/**
 * A point-in-time view of every path that can be compared, plus where the repository was
 * pointing when it was taken.
 *
 * `available: false` means no snapshot could be taken (for `snapshotTree`, most often a
 * workspace that is not a git repository). Callers say so rather than pretending the tree
 * was clean.
 */
export interface TreeSnapshot {
  available: boolean;
  /** Reason the snapshot is unavailable; only set when `available` is false. */
  reason?: string;
  /** Repo-relative path → `"<status code>:<content hash>"` (git) or the content hash (walk). */
  entries: Map<string, string>;
  /** HEAD and branch at the moment of the snapshot. */
  identity: RepositoryIdentity;
  /** Set by the filesystem walk when it stopped at its file bound; entries are then partial. */
  truncated?: boolean;
}

const NO_IDENTITY: RepositoryIdentity = { head: null, branch: null };

const UNAVAILABLE = (reason: string): TreeSnapshot => ({
  available: false,
  reason,
  entries: new Map(),
  identity: NO_IDENTITY,
});

/**
 * Read HEAD and the branch name in one `git rev-parse`.
 *
 * Failure is not fatal to the snapshot. A freshly `git init`ed repository has no HEAD to
 * resolve, and the file-level half works there perfectly well.
 */
export function readIdentity(workspaceRoot: string): RepositoryIdentity {
  try {
    const raw = execFileSync('git', ['rev-parse', 'HEAD', '--abbrev-ref', 'HEAD'], {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (typeof raw !== 'string') return NO_IDENTITY;
    const [head, branch] = raw.trim().split('\n');
    return { head: head || null, branch: branch || null };
  } catch {
    return NO_IDENTITY;
  }
}

/**
 * Hash a working-tree file, or mark it absent.
 *
 * Absent is a real state, not an error: a path can appear in porcelain output as a staged
 * deletion, and an agent that *deletes* a file is precisely what is being watched for.
 */
export function hashPath(absolute: string): string {
  try {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile()) return `<${stat.isDirectory() ? 'dir' : 'special'}>`;
    return crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  } catch {
    return '<absent>';
  }
}

/**
 * Snapshot the git working tree of `workspaceRoot`.
 *
 * `-z` (NUL-separated) rather than plain `--porcelain` because git C-quotes paths containing
 * spaces or non-ASCII in the human-readable form, and a quoted path cannot be handed back to
 * `fs.readFileSync`. `--untracked-files=all` so a newly created file is listed individually
 * instead of being collapsed into a single `?? dir/` entry.
 *
 * Records HEAD and the branch alongside the paths, so an agent that commits or switches refs
 * is caught even when no file ends up looking different.
 */
export function snapshotTree(workspaceRoot: string): TreeSnapshot {
  // Typed `unknown` rather than `string` so the guard below is a real check and not a
  // comparison TypeScript has already narrowed away.
  let raw: unknown;
  try {
    raw = execFileSync(
      'git',
      ['status', '--porcelain', '-z', '--untracked-files=all'],
      {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        maxBuffer: 32 * 1024 * 1024,
        // Capture git's stderr instead of inheriting it. Otherwise a workspace that is not
        // a repository prints a bare `fatal: not a git repository` over the caller's message.
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (err) {
    return UNAVAILABLE(err instanceof Error ? err.message.split('\n')[0] : String(err));
  }

  // A snapshot is a diagnostic wrapped around someone else's work, so it must never be the
  // thing that breaks it. If `git status` came back as anything other than text — a stubbed
  // `execFileSync` under a test, a Buffer if the encoding option is ever dropped — report
  // the snapshot as unavailable rather than throwing.
  if (typeof raw !== 'string') {
    return UNAVAILABLE(`git status returned ${typeof raw}, not text`);
  }

  const entries = new Map<string, string>();
  // Each record is `XY <path>`; rename/copy records are followed by a second NUL-terminated
  // field holding the ORIGINAL path, which must be consumed so it is not mistaken for the
  // next record's status code.
  const fields = raw.split('\0').filter((f: string) => f.length > 0);
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const status = field.slice(0, 2);
    const rel = field.slice(3);
    if (!rel) continue;
    entries.set(rel, `${status}:${hashPath(path.join(workspaceRoot, rel))}`);
    if (status[0] === 'R' || status[0] === 'C') {
      const origin = fields[++i];
      if (origin !== undefined) {
        entries.set(origin, `${status}-from:${hashPath(path.join(workspaceRoot, origin))}`);
      }
    }
  }

  return { available: true, entries, identity: readIdentity(workspaceRoot) };
}

/** Directories the filesystem walk never enters. */
export const FILESYSTEM_WALK_SKIPPED = ['.git', 'node_modules'];

/** How many files the filesystem walk hashes before it gives up and reports `truncated`. */
export const FILESYSTEM_WALK_LIMIT = 50_000;

/**
 * Snapshot a directory that is not a git work tree: every file's content hash, keyed by its
 * root-relative path with forward slashes.
 *
 * `.gitignore` is deliberately not honoured: the walk exists to catch writes, and an ignore
 * rule can only hide one. Only `.git/` and `node_modules/` are skipped. Past `limit` files
 * the walk stops and marks the snapshot `truncated`, so a caller can say its detection was
 * partial instead of hashing an unbounded tree.
 */
export function snapshotFilesystem(root: string, limit: number = FILESYSTEM_WALK_LIMIT): TreeSnapshot {
  const entries = new Map<string, string>();
  let truncated = false;

  const walk = (dir: string): void => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      // An unreadable directory holds nothing to compare; keep walking the rest.
      return;
    }
    for (const entry of dirents) {
      if (truncated) return;
      const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!FILESYSTEM_WALK_SKIPPED.includes(entry.name)) walk(rel);
        continue;
      }
      if (entries.size >= limit) {
        truncated = true;
        return;
      }
      entries.set(rel, hashPath(path.join(root, rel)));
    }
  };

  walk('');
  return { available: true, entries, identity: NO_IDENTITY, truncated };
}

/**
 * A fingerprint of the git index: SHA-256 of `git ls-files --stage -z`, or null when git
 * cannot answer.
 *
 * Porcelain status codes plus working-tree hashes cannot see a re-stage of an already
 * staged path (`AM` before and after, working file unchanged), so the index needs its own
 * witness. The staged blob ids are in this listing; their contents are not needed.
 */
export function readIndexFingerprint(workspaceRoot: string): string | null {
  try {
    const raw = execFileSync('git', ['ls-files', '--stage', '-z'], {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (typeof raw !== 'string') return null;
    return crypto.createHash('sha256').update(raw).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Paths that differ between two snapshots, sorted, skipping those `isExempt` claims.
 *
 * Returns nothing when either snapshot is unavailable: the caller reports that separately,
 * because "could not look" is not "nothing changed".
 */
export function diffSnapshotEntries(
  before: TreeSnapshot,
  after: TreeSnapshot,
  isExempt: (rel: string) => boolean = () => false,
): string[] {
  if (!before.available || !after.available) return [];

  const changed = new Set<string>();
  for (const [rel, sig] of after.entries) {
    if (isExempt(rel)) continue;
    if (before.entries.get(rel) !== sig) changed.add(rel);
  }
  for (const rel of before.entries.keys()) {
    if (isExempt(rel)) continue;
    if (!after.entries.has(rel)) changed.add(rel);
  }
  return [...changed].sort();
}

/** One field of the repository's identity that moved between two snapshots. */
export interface IdentityChange {
  field: 'HEAD' | 'branch';
  before: string;
  after: string;
}

/**
 * Repository identity fields that differ between two snapshots.
 *
 * A field that was unreadable at either end is skipped rather than reported as a change:
 * "we could not tell" and "it moved" are different claims, and only one of them is evidence.
 */
export function diffRepositoryIdentity(before: TreeSnapshot, after: TreeSnapshot): IdentityChange[] {
  if (!before.available || !after.available) return [];

  const changes: IdentityChange[] = [];
  const fields: Array<[IdentityChange['field'], keyof RepositoryIdentity]> = [
    ['HEAD', 'head'],
    ['branch', 'branch'],
  ];

  for (const [label, key] of fields) {
    const a = before.identity[key];
    const b = after.identity[key];
    if (a === null || b === null) continue;
    if (a !== b) changes.push({ field: label, before: a, after: b });
  }

  return changes;
}

/**
 * Render a string safe to print to a terminal.
 *
 * Path names are bytes, and almost anything that is not `/` or NUL is legal in one —
 * including newlines and ESC. Printing such a name raw lets it forge the rest of a report:
 * a file called `\n  - harmless.ts` adds a line to the list, and one containing a CSI
 * sequence can repaint or erase what is above it. C0, DEL and C1 are escaped; ordinary
 * Unicode is left alone.
 */
export function escapeControlChars(value: string): string {
  const named: Record<string, string> = {
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
  };
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, ch =>
    named[ch] ?? `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
}
