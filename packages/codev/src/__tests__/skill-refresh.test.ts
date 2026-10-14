/**
 * Issue #1811: `codev update` refreshes unedited shipped skills and offers an edited one's
 * new version as `.codev-new`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifySkill,
  hashSkillDir,
  hashSkillFiles,
  refreshSkills,
} from '../lib/skill-refresh.js';
import { SHIPPED_SKILL_HASHES } from '../lib/shipped-skill-hashes.js';
import { SKILL_PROVIDERS } from '../lib/scaffold.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let base: string;
let skeleton: string;
let project: string;

function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(project, rel), 'utf-8');
}

const OLD = '# demo\n\nVersion one.\n';
const NEW = '# demo\n\nVersion two.\n';
const OLD_HASH = hashSkillFiles([{ path: 'SKILL.md', content: OLD }]);
const HISTORY = { '.claude/skills/demo': [OLD_HASH] };

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-refresh-'));
  skeleton = path.join(base, 'skeleton');
  project = path.join(base, 'project');
  write(skeleton, '.claude/skills/demo/SKILL.md', NEW);
  fs.mkdirSync(project, { recursive: true });
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe('skill hashing', () => {
  it('ignores line endings, a pending .codev-new and .DS_Store', () => {
    write(project, 'a/SKILL.md', NEW);
    write(project, 'b/SKILL.md', NEW.replace(/\n/g, '\r\n'));
    write(project, 'b/SKILL.md.codev-new', 'pending');
    write(project, 'b/.DS_Store', 'finder');
    expect(hashSkillDir(path.join(project, 'b'))).toBe(hashSkillDir(path.join(project, 'a')));
  });

  it('a symlinked skill directory is not a directory', () => {
    write(base, 'elsewhere/SKILL.md', NEW);
    fs.mkdirSync(path.join(project, '.claude/skills'), { recursive: true });
    fs.symlinkSync(path.join(base, 'elsewhere'), path.join(project, '.claude/skills/demo'));
    expect(classifySkill(path.join(project, '.claude/skills/demo'), path.join(skeleton, '.claude/skills/demo'), '.claude/skills/demo'))
      .toBe('not-a-directory');
  });
});

describe('refreshSkills', () => {
  it('adds a missing skill', () => {
    const result = refreshSkills(project, skeleton, { history: HISTORY });
    expect(result.added).toEqual(['.claude/skills/demo/']);
    expect(read('.claude/skills/demo/SKILL.md')).toBe(NEW);
  });

  it('leaves an up-to-date skill alone', () => {
    write(project, '.claude/skills/demo/SKILL.md', NEW);
    const result = refreshSkills(project, skeleton, { history: HISTORY });
    expect(result).toMatchObject({ added: [], updated: [], conflicts: [] });
  });

  it('replaces an unedited older version, keeping a pending .codev-new', () => {
    write(project, '.claude/skills/demo/SKILL.md', OLD);
    write(project, '.claude/skills/demo/SKILL.md.codev-new', 'pending');
    const result = refreshSkills(project, skeleton, { history: HISTORY });
    expect(result.updated).toEqual(['.claude/skills/demo/']);
    expect(read('.claude/skills/demo/SKILL.md')).toBe(NEW);
    expect(read('.claude/skills/demo/SKILL.md.codev-new')).toBe('pending');
  });

  it('a shipped version that dropped a file loses that file on replace', () => {
    write(project, '.claude/skills/demo/SKILL.md', OLD);
    write(project, '.claude/skills/demo/extra.md', 'old helper');
    const history = {
      '.claude/skills/demo': [hashSkillFiles([{ path: 'SKILL.md', content: OLD }, { path: 'extra.md', content: 'old helper' }])],
    };
    refreshSkills(project, skeleton, { history });
    expect(fs.existsSync(path.join(project, '.claude/skills/demo/extra.md'))).toBe(false);
  });

  it('keeps an edited skill and writes the new version beside it, on every run', () => {
    write(project, '.claude/skills/demo/SKILL.md', `${OLD}My own rule.\n`);
    for (let run = 0; run < 2; run++) {
      const result = refreshSkills(project, skeleton, { history: HISTORY });
      expect(result.conflicts).toEqual(['.claude/skills/demo/SKILL.md']);
      expect(read('.claude/skills/demo/SKILL.md')).toBe(`${OLD}My own rule.\n`);
      expect(read('.claude/skills/demo/SKILL.md.codev-new')).toBe(NEW);
    }
  });

  it('an edited skill gets .codev-new only for the files that differ', () => {
    write(skeleton, '.claude/skills/demo/helper.md', 'helper\n');
    write(project, '.claude/skills/demo/SKILL.md', 'mine\n');
    write(project, '.claude/skills/demo/helper.md', 'helper\n');
    const result = refreshSkills(project, skeleton, { history: HISTORY });
    expect(result.conflicts).toEqual(['.claude/skills/demo/SKILL.md']);
    expect(fs.existsSync(path.join(project, '.claude/skills/demo/helper.md.codev-new'))).toBe(false);
  });

  it('--force replaces an edited skill', () => {
    write(project, '.claude/skills/demo/SKILL.md', 'mine\n');
    const result = refreshSkills(project, skeleton, { history: HISTORY, force: true });
    expect(result.updated).toEqual(['.claude/skills/demo/']);
    expect(read('.claude/skills/demo/SKILL.md')).toBe(NEW);
  });

  it('never writes through a symlinked skill directory', () => {
    write(base, 'elsewhere/SKILL.md', OLD);
    fs.mkdirSync(path.join(project, '.claude/skills'), { recursive: true });
    fs.symlinkSync(path.join(base, 'elsewhere'), path.join(project, '.claude/skills/demo'));
    const result = refreshSkills(project, skeleton, { history: HISTORY });
    expect(result.notDirectories).toEqual(['.claude/skills/demo/']);
    expect(fs.readFileSync(path.join(base, 'elsewhere/SKILL.md'), 'utf-8')).toBe(OLD);
    expect(fs.readdirSync(path.join(base, 'elsewhere'))).toEqual(['SKILL.md']);
  });
});

describe('shipped skill history', () => {
  it('lists the current version of every shipped skill', () => {
    for (const provider of SKILL_PROVIDERS) {
      const skillsDir = path.join(repoRoot, 'codev-skeleton', `.${provider}`, 'skills');
      for (const name of fs.readdirSync(skillsDir)) {
        const key = `.${provider}/skills/${name}`;
        const hash = hashSkillDir(path.join(skillsDir, name));
        expect(
          SHIPPED_SKILL_HASHES[key] ?? [],
          `${key} changed: regenerate the history with \`npx tsx packages/codev/scripts/generate-shipped-skill-hashes.mts\``,
        ).toContain(hash);
      }
    }
  });
});
