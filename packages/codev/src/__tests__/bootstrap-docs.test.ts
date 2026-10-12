/**
 * Spec 1797: `codev bootstrap-docs`, end to end in temp repositories with a stub agent.
 *
 * The agent is injected through `runBootstrapDocs`'s dependency seam: `spawnAgent` performs
 * the scenario's writes in-process and resolves, so no model runs and nothing waits on a
 * terminal. Starters and the skill are read from `codev-skeleton/` via the repo root, so no
 * prior build is needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  MAX_PROMPT_BYTES,
  PROMPT_FILE,
  buildGitDigest,
  renderPrompt,
  runBootstrapDocs,
  type AgentExit,
  type AgentLaunch,
  type BootstrapDocsDeps,
} from '../commands/bootstrap-docs.js';
import type { InteractiveTaskLauncher } from '../agent-farm/utils/harness.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const skeletonDir = path.join(repoRoot, 'codev-skeleton');
const templatesDir = path.join(skeletonDir, 'templates');

const STARTERS: Record<string, string> = {
  'arch-critical.md': 'arch-critical.md',
  'lessons-critical.md': 'lessons-critical.md',
  'arch.md': 'arch.starter.md',
  'lessons-learned.md': 'lessons-learned.starter.md',
};

const DRAFTS: Record<string, string> = {
  'arch.md': '# Architecture\n\n## Shape\n\nA CLI and a worker.\n\n## Persistence\n\nOne SQLite file.\n',
  'lessons-learned.md': '# Lessons Learned\n\n## Testing\n\n- Run the worker tests against a real SQLite file.\n',
  'arch-critical.md': [
    '# arch-critical.md — Always-On System-Shape Facts (HOT tier)',
    '',
    '## Critical facts (consult before deciding)',
    '- The worker owns every write to the database.',
    '',
    '## Map of arch.md (consult when…)',
    '- Shape — adding a process.',
    '- Persistence — touching storage.',
    '',
  ].join('\n'),
  'lessons-critical.md': [
    '# lessons-critical.md — Always-On Engineering Wisdom (HOT tier)',
    '',
    '## Critical lessons (consult before deciding)',
    '- Test against real SQLite, never a mock.',
    '',
    '## Map of lessons-learned.md (consult when…)',
    '- Testing — writing tests.',
    '',
  ].join('\n'),
};

let dir: string;
let lines: string[];
let spawned: AgentLaunch[];

function git(...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(rel: string, content: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf-8');
}

function resource(name: string): string {
  return `codev/resources/${name}`;
}

function writeStarters(): void {
  for (const [name, starter] of Object.entries(STARTERS)) {
    write(resource(name), fs.readFileSync(path.join(templatesDir, starter), 'utf-8'));
  }
}

function writeDrafts(names: string[] = Object.keys(DRAFTS)): void {
  for (const name of names) write(resource(name), DRAFTS[name]);
}

/** A git project: starters, one source file, one commit. */
function setUpGitProject(): void {
  git('init', '-q', '-b', 'main');
  // A developer's global excludes file (often ignoring `.claude/settings.local.json`) must
  // not decide what these tests see.
  git('config', 'core.excludesFile', '/dev/null');
  writeStarters();
  write('src/main.ts', 'export const main = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'fix: initial import');
}

const stubLauncher: InteractiveTaskLauncher = {
  supported: true,
  harnessName: 'claude',
  buildLaunch: prompt => ({ executable: 'claude', args: ['--dangerously-skip-permissions', '--', prompt] }),
};

function deps(agent: () => AgentExit | void = () => {}, overrides: Partial<BootstrapDocsDeps> = {}): Partial<BootstrapDocsDeps> {
  return {
    skeletonDir,
    resolveLauncher: () => stubLauncher,
    isExecutableAvailable: () => true,
    confirm: async () => true,
    stdinIsTTY: true,
    spawnAgent: async launch => {
      spawned.push(launch);
      return agent() ?? { code: 0, signal: null };
    },
    log: line => lines.push(line),
    ...overrides,
  };
}

function output(): string {
  return lines.join('\n');
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-docs-'));
  lines = [];
  spawned = [];
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('codev bootstrap-docs: no-op paths', () => {
  it('refuses a directory without codev/', async () => {
    const result = await runBootstrapDocs({ cwd: dir }, deps());
    expect(result.exitCode).toBe(1);
    expect(output()).toContain('codev adopt');
  });

  it('re-run on a populated result launches nothing and changes nothing (scenario 2)', async () => {
    setUpGitProject();
    await runBootstrapDocs({ cwd: dir }, deps(() => writeDrafts()));
    const contents = Object.keys(DRAFTS).map(name => read(resource(name)));
    spawned = [];
    lines = [];

    const result = await runBootstrapDocs({ cwd: dir }, deps(() => writeDrafts()));
    expect(result.outcome).toBe('nothing-eligible');
    expect(result.exitCode).toBe(0);
    expect(spawned).toEqual([]);
    expect(Object.keys(DRAFTS).map(name => read(resource(name)))).toEqual(contents);
    expect(output()).toContain('Nothing needs bootstrapping');
  });

  it('an empty repository launches nothing (scenario 5)', async () => {
    git('init', '-q', '-b', 'main');
    writeStarters();
    write('CLAUDE.md', '# x\n');
    const result = await runBootstrapDocs({ cwd: dir }, deps());
    expect(result.outcome).toBe('empty-repo');
    expect(result.exitCode).toBe(0);
    expect(spawned).toEqual([]);
  });

  it('a missing file is reported, not created, and does not launch on its own', async () => {
    setUpGitProject();
    writeDrafts(['arch.md', 'arch-critical.md', 'lessons-critical.md']);
    fs.rmSync(path.join(dir, resource('lessons-learned.md')));
    const result = await runBootstrapDocs({ cwd: dir }, deps());
    expect(result.outcome).toBe('nothing-eligible');
    expect(spawned).toEqual([]);
    expect(fs.existsSync(path.join(dir, resource('lessons-learned.md')))).toBe(false);
    expect(output()).toContain('codev update');
  });

  it('holds back a hot placeholder whose cold doc is missing', async () => {
    setUpGitProject();
    fs.rmSync(path.join(dir, resource('lessons-learned.md')));
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => writeDrafts(['arch.md', 'arch-critical.md'])));
    const held = result.files.find(status => status.file.name === 'lessons-critical.md');
    expect(held?.heldBack).toContain('lessons-learned.md');
    expect(result.validation?.map(draft => draft.name).sort()).toEqual(['arch-critical.md', 'arch.md']);
    expect(result.exitCode).toBe(0);
  });

  it('--dry-run reports eligibility and the launch, and writes nothing', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir, dryRun: true }, deps());
    expect(result.outcome).toBe('dry-run');
    expect(spawned).toEqual([]);
    expect(fs.existsSync(path.join(dir, PROMPT_FILE))).toBe(false);
    expect(output()).toContain('Would launch (claude): claude --dangerously-skip-permissions --');
  });

  it('an unsupported harness writes the prompt file and launches nothing (scenario 15)', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(undefined, {
      resolveLauncher: () => ({ supported: false, reason: 'the harness for "aider" is not recognised' }),
    }));
    expect(result.outcome).toBe('manual');
    expect(result.exitCode).toBe(0);
    expect(spawned).toEqual([]);
    expect(read(PROMPT_FILE)).toContain('bootstrap-mode');
    expect(output()).toContain('aider');
    expect(read(resource('arch.md'))).toBe(fs.readFileSync(path.join(templatesDir, 'arch.starter.md'), 'utf-8'));
  });

  it('an agent missing from PATH takes the manual fallback', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(undefined, { isExecutableAvailable: () => false }));
    expect(result.outcome).toBe('manual');
    expect(output()).toContain('not found on PATH');
  });

  it('resolves an unrecognised configured agent to the manual fallback', async () => {
    setUpGitProject();
    write('.codev/config.json', JSON.stringify({ shell: { architect: 'aider --model x' } }));
    const overrides = deps();
    delete overrides.resolveLauncher;
    const result = await runBootstrapDocs({ cwd: dir }, overrides);
    expect(result.outcome).toBe('manual');
    expect(spawned).toEqual([]);
  });

  it('a prompt too long for a command-line argument takes the manual fallback', async () => {
    setUpGitProject();
    // A skeleton whose prompt template alone is over the limit.
    const bigSkeleton = path.join(dir, '..', `${path.basename(dir)}-skeleton`);
    fs.cpSync(templatesDir, path.join(bigSkeleton, 'templates'), { recursive: true });
    fs.cpSync(path.join(skeletonDir, '.claude'), path.join(bigSkeleton, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(bigSkeleton, 'templates', 'bootstrap-docs-prompt.md'), `${'x'.repeat(MAX_PROMPT_BYTES)}\n{{SKILL}}\n`);
    try {
      const result = await runBootstrapDocs({ cwd: dir }, deps(undefined, { skeletonDir: bigSkeleton }));
      expect(result.outcome).toBe('manual');
      expect(spawned).toEqual([]);
      expect(output()).toContain('too long to pass as a command-line argument');
      expect(fs.statSync(path.join(dir, PROMPT_FILE)).size).toBeGreaterThan(MAX_PROMPT_BYTES);
    } finally {
      fs.rmSync(bigSkeleton, { recursive: true, force: true });
    }
  });

  it('states bypass flags as bypass, and other permission flags without claiming either way', async () => {
    setUpGitProject();
    const withArgs = (args: string[]): InteractiveTaskLauncher => ({
      supported: true,
      harnessName: 'claude',
      buildLaunch: prompt => ({ executable: 'claude', args: [...args, '--', prompt] }),
    });
    await runBootstrapDocs({ cwd: dir }, deps(undefined, { confirm: async () => false }));
    expect(output()).toContain('will NOT ask');

    lines = [];
    await runBootstrapDocs({ cwd: dir }, deps(undefined, {
      confirm: async () => false,
      resolveLauncher: () => withArgs(['--permission-mode', 'plan']),
    }));
    expect(output()).toContain('Permission flags from your config: --permission-mode=plan (see your agent');
    expect(output()).not.toContain('will NOT ask');
    expect(output()).toContain(`The prompt is saved at ${PROMPT_FILE}`);
  });

  it('non-TTY stdin declines without asking; a "no" declines too', async () => {
    setUpGitProject();
    let asked = false;
    const nonTty = await runBootstrapDocs({ cwd: dir }, deps(undefined, {
      stdinIsTTY: false,
      confirm: async () => { asked = true; return true; },
    }));
    expect(nonTty.outcome).toBe('declined');
    expect(asked).toBe(false);

    const no = await runBootstrapDocs({ cwd: dir }, deps(undefined, { confirm: async () => false }));
    expect(no.outcome).toBe('declined');
    expect(spawned).toEqual([]);
  });
});

describe('codev bootstrap-docs: launched sessions', () => {
  it('valid drafts ⇒ exit 0, files listed, nothing staged (scenario 1)', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => writeDrafts()));
    expect(result.exitCode).toBe(0);
    expect(result.validation?.every(draft => draft.state === 'written' && draft.violations.length === 0)).toBe(true);
    expect(git('diff', '--cached', '--name-only')).toBe('');
    expect(output()).toContain('Review before commit — nothing has been staged or committed.');
    expect(output()).toContain('gitignored paths are not watched');
    for (const name of Object.keys(DRAFTS)) expect(output()).toContain(`✓ ${resource(name)}`);
  });

  it('states the launch before confirming and hands the agent the full prompt', async () => {
    setUpGitProject();
    let statedFirst = false;
    await runBootstrapDocs({ cwd: dir }, deps(() => writeDrafts(), {
      confirm: async () => {
        statedFirst = output().includes('consumes model quota') && output().includes('--dangerously-skip-permissions');
        return true;
      },
    }));
    expect(statedFirst).toBe(true);
    const prompt = spawned[0].args[spawned[0].args.length - 1];
    expect(prompt).toContain('`codev/resources/arch.md`');
    expect(prompt).toContain('fix: initial import');
    expect(prompt).toContain('## Mode: bootstrap-mode');
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(read(PROMPT_FILE)).toBe(prompt);
  });

  it('a curated-file edit, a source edit and a commit are each named; nothing reverted (scenario 13)', async () => {
    setUpGitProject();
    writeDrafts(['arch.md']);
    git('add', '.');
    git('commit', '-q', '-m', 'curate arch.md');

    const curated = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts(['arch-critical.md', 'lessons-critical.md', 'lessons-learned.md']);
      write(resource('arch.md'), `${DRAFTS['arch.md']}\nagent edit\n`);
    }));
    expect(curated.exitCode).toBe(1);
    expect(curated.report?.governanceChanged).toEqual([resource('arch.md')]);
    expect(curated.report?.outOfScope).toEqual([]);
    expect(read(resource('arch.md'))).toContain('agent edit');
  });

  it('a source edit and a new file are named, exit non-zero', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts();
      write('src/main.ts', 'export const main = 2;\n');
      write('src/added.ts', 'x\n');
    }));
    expect(result.exitCode).toBe(1);
    expect(result.report?.outOfScope.map(change => change.path)).toEqual(['src/added.ts', 'src/main.ts']);
    expect(read('src/main.ts')).toBe('export const main = 2;\n');
    expect(output()).toContain('- src/main.ts');
  });

  it('an agent commit is reported as HEAD and index movement', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts();
      git('add', 'codev/resources');
      git('commit', '-q', '-m', 'agent commit');
    }));
    expect(result.exitCode).toBe(1);
    expect(result.report?.identityChanges.map(change => change.field)).toEqual(['HEAD']);
    expect(result.report?.indexChanged).toBe(true);
    expect(output()).toContain('HEAD moved');
  });

  it('nothing written ⇒ every eligible file reported unwritten (scenario 14)', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps());
    expect(result.exitCode).toBe(1);
    expect(result.validation?.every(draft => draft.state === 'unwritten')).toBe(true);
    expect(output()).toContain('still the starter placeholder');
  });

  it('partial writes ⇒ unwritten reported, written drafts kept', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts(['arch.md', 'arch-critical.md']);
      fs.rmSync(path.join(dir, resource('lessons-learned.md')));
    }));
    expect(result.exitCode).toBe(1);
    const states = Object.fromEntries(result.validation!.map(draft => [draft.name, draft.state]));
    expect(states).toEqual({
      'arch-critical.md': 'written',
      'lessons-critical.md': 'unwritten',
      'arch.md': 'written',
      'lessons-learned.md': 'deleted',
    });
    expect(read(resource('arch.md'))).toBe(DRAFTS['arch.md']);
  });

  it('a draft with a leftover slot and a bad map entry is reported', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts();
      write(resource('arch-critical.md'), `${DRAFTS['arch-critical.md']}- Nowhere — never.\n- <A system-shape fact>\n`);
    }));
    expect(result.exitCode).toBe(1);
    const kinds = result.validation!.find(draft => draft.name === 'arch-critical.md')!.violations.map(v => v.kind);
    expect(kinds).toContain('unknown-map-section');
    expect(kinds).toContain('leftover-marker');
  });

  it('mixed state: a curated arch.md with 13 sections stays byte-identical; unmapped listed as info (scenario 3)', async () => {
    setUpGitProject();
    const sections = Array.from({ length: 13 }, (_, i) => `## Area ${String.fromCharCode(65 + i)}\n\nText.\n`);
    const curatedArch = `# Architecture\n\n${sections.join('\n')}`;
    write(resource('arch.md'), curatedArch);
    const map = Array.from({ length: 12 }, (_, i) => `- Area ${String.fromCharCode(65 + i)} — when ${i}.`);
    const hot = [
      '# arch-critical.md — Always-On System-Shape Facts (HOT tier)',
      '',
      '## Critical facts (consult before deciding)',
      '- One fact.',
      '',
      '## Map of arch.md (consult when…)',
      ...map,
      '',
    ].join('\n');

    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts(['lessons-critical.md', 'lessons-learned.md']);
      write(resource('arch-critical.md'), hot);
    }));
    expect(read(resource('arch.md'))).toBe(curatedArch);
    expect(result.validation?.map(draft => draft.name)).not.toContain('arch.md');
    const archCritical = result.validation!.find(draft => draft.name === 'arch-critical.md')!;
    expect(archCritical.violations).toEqual([]);
    expect(archCritical.unmappedInfo).toEqual(['Area M']);
    expect(result.exitCode).toBe(0);
    expect(output()).toContain('info: cold sections not in the map');
  });

  it('a harness scratch file is named with its annotation and exits non-zero', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts();
      write('.claude/settings.local.json', '{}\n');
    }));
    expect(result.exitCode).toBe(1);
    expect(result.report?.outOfScope).toEqual([
      { path: '.claude/settings.local.json', annotation: 'written by the agent harness itself, usually benign' },
    ]);
    expect(output()).toContain('usually benign');
  });

  it('a re-stage of an already-staged path is reported as an index change', async () => {
    setUpGitProject();
    write('src/main.ts', 'staged v1\n');
    git('add', 'src/main.ts');
    write('src/main.ts', 'working v2\n');
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts();
      write('src/main.ts', 'staged v3\n');
      git('add', 'src/main.ts');
      write('src/main.ts', 'working v2\n');
    }));
    expect(result.report?.outOfScope).toEqual([]);
    expect(result.report?.indexChanged).toBe(true);
    expect(result.exitCode).toBe(1);
  });

  it('pre-existing dirt and .consult/ writes are not reported', async () => {
    setUpGitProject();
    write('src/main.ts', 'dirty before\n');
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts();
      write('.consult/bootstrap-docs/notes.md', 'x\n');
    }));
    expect(result.report?.outOfScope).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('an agent exiting non-zero after valid drafts is reported; drafts kept', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts();
      return { code: 2, signal: null };
    }));
    expect(result.exitCode).toBe(1);
    expect(result.validation?.every(draft => draft.state === 'written' && draft.violations.length === 0)).toBe(true);
    expect(output()).toContain('Agent exited with status 2');
  });

  it('an agent that cannot start is reported', async () => {
    setUpGitProject();
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => ({ code: null, signal: null, error: 'spawn claude ENOENT' })));
    expect(result.exitCode).toBe(1);
    expect(output()).toContain('Agent could not be started: spawn claude ENOENT');
    expect(output()).toContain(`The prompt is saved at ${PROMPT_FILE}`);
  });

  it('non-git directory: a source edit is named, exit non-zero', async () => {
    writeStarters();
    write('src/main.ts', 'export const main = 1;\n');
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => {
      writeDrafts();
      write('src/main.ts', 'edited\n');
    }));
    expect(result.exitCode).toBe(1);
    expect(result.report?.outOfScope.map(change => change.path)).toEqual(['src/main.ts']);
    expect(output()).toContain('Not a git repository');
    expect(output()).toContain('paths the root .gitignore ignores');
  });

  it('non-git directory with valid drafts only ⇒ exit 0', async () => {
    writeStarters();
    write('src/main.ts', 'export const main = 1;\n');
    const result = await runBootstrapDocs({ cwd: dir }, deps(() => writeDrafts()));
    expect(result.report?.outOfScope).toEqual([]);
    expect(result.exitCode).toBe(0);
  });
});

describe('prompt helpers', () => {
  it('renders placeholders in one pass, never re-scanning inserted text', () => {
    expect(renderPrompt('A {{SKILL}} B {{PROJECT_NAME}} {{UNKNOWN}}', { SKILL: 'has {{PROJECT_NAME}}', PROJECT_NAME: 'p' }))
      .toBe('A has {{PROJECT_NAME}} B p {{UNKNOWN}}');
  });

  it('git digest: no commits ⇒ work from the code alone', () => {
    git('init', '-q', '-b', 'main');
    write('a.ts', 'a\n');
    expect(buildGitDigest(dir)).toContain('No commit history');
  });

  it('git digest: not a git repository ⇒ work from the code alone', () => {
    expect(buildGitDigest(dir)).toContain('No commit history');
  });

  it('git digest: recent subjects plus older incident commits, de-duplicated', () => {
    git('init', '-q', '-b', 'main');
    write('a.ts', 'a\n');
    git('add', '.');
    git('commit', '-q', '-m', 'Revert the cache layer');
    write('a.ts', 'b\n');
    git('commit', '-q', '-am', 'add feature');
    const digest = buildGitDigest(dir);
    expect(digest).toContain('add feature');
    expect(digest.match(/Revert the cache layer/g)).toHaveLength(1);
  });
});
