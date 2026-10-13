/**
 * Spec 1797 — the deterministic half of `codev bootstrap-docs`: placeholder classification,
 * the non-empty-repository rule, and the hot/cold draft validator.
 *
 * Starters are read from `codev-skeleton/templates/` via the repo root, so no prior build
 * is needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  GOVERNANCE_FILES,
  knownStarterTexts,
  classifyGovernanceFile,
  classifyProjectFile,
  classifyProjectGovernance,
  bootstrapEligibleFiles,
  shouldOfferBootstrap,
  isNonEmptyRepo,
  validateHotFile,
  validateColdFile,
  isStarterMarker,
  nonCommentLineCount,
  type GovernanceFile,
} from '../lib/governance-bootstrap.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const templatesDir = path.join(repoRoot, 'codev-skeleton', 'templates');

function governanceFile(name: string): GovernanceFile {
  const file = GOVERNANCE_FILES.find(f => f.name === name);
  if (!file) throw new Error(`unknown governance file ${name}`);
  return file;
}

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf-8');
}

const ARCH_CRITICAL = governanceFile('arch-critical.md');
const LESSONS_CRITICAL = governanceFile('lessons-critical.md');
const ARCH = governanceFile('arch.md');

describe('classifyGovernanceFile', () => {
  it('classifies every shipped starter as a placeholder', () => {
    for (const file of GOVERNANCE_FILES) {
      const starters = knownStarterTexts(file, templatesDir);
      expect(starters.length, `${file.name}: current starter found`).toBeGreaterThan(0);
      for (const starter of starters) {
        expect(classifyGovernanceFile(starter, starters), file.name).toBe('placeholder');
      }
    }
  });

  it('treats lessons-critical.md exactly as shipped (three seeded lessons) as a placeholder', () => {
    const starters = knownStarterTexts(LESSONS_CRITICAL, templatesDir);
    const shipped = fs.readFileSync(path.join(templatesDir, 'lessons-critical.md'), 'utf-8');
    expect(shipped).toContain('Check for existing work');
    expect(classifyGovernanceFile(shipped, starters)).toBe('placeholder');
  });

  it('treats a starter with one added real line as curated', () => {
    const starters = knownStarterTexts(ARCH, templatesDir);
    const edited = `${starters[0]}\n## Services\nThe API talks to the worker through a queue.\n`;
    expect(classifyGovernanceFile(edited, starters)).toBe('curated');
  });

  it('treats a starter with one edited slot line as curated', () => {
    const starters = knownStarterTexts(ARCH_CRITICAL, templatesDir);
    const edited = starters[0].replace(
      /^- <A system-shape fact.*$/m,
      '- All persistent state lives in Postgres; never write it from the worker.',
    );
    expect(edited).not.toBe(starters[0]);
    expect(classifyGovernanceFile(edited, starters)).toBe('curated');
  });

  it('treats changed trailing whitespace as curated', () => {
    const starters = knownStarterTexts(ARCH, templatesDir);
    const edited = starters[0].replace('_No architecture documented yet._', '_No architecture documented yet._  ');
    expect(classifyGovernanceFile(edited, starters)).toBe('curated');
  });

  it('treats a CRLF copy of a starter as a placeholder', () => {
    const starters = knownStarterTexts(ARCH_CRITICAL, templatesDir);
    expect(classifyGovernanceFile(starters[0].replace(/\n/g, '\r\n'), starters)).toBe('placeholder');
  });

  it('treats a starter with every marker removed as curated', () => {
    const starters = knownStarterTexts(ARCH, templatesDir);
    const stripped = '# Architecture\n\nThis document evolves as the project grows. Update it during the review phase of any work that introduces or changes architectural patterns.\n';
    expect(classifyGovernanceFile(stripped, starters)).toBe('curated');
  });

  it('does not accept lines mixed across starter versions', () => {
    const versionA = '# Doc\n\n_No things documented yet._\nVersion A wording.\n';
    const versionB = '# Doc\n\n_No things documented yet._\nVersion B wording.\n';
    const mixed = '# Doc\n\n_No things documented yet._\nVersion A wording.\nVersion B wording.\n';
    expect(classifyGovernanceFile(versionA, [versionA, versionB])).toBe('placeholder');
    expect(classifyGovernanceFile(mixed, [versionA, versionB])).toBe('curated');
  });

  it('classifies an absent file as missing', () => {
    expect(classifyGovernanceFile(null, knownStarterTexts(ARCH, templatesDir))).toBe('missing');
  });

  it('classifies this repo\'s curated governance files as curated', () => {
    for (const file of GOVERNANCE_FILES) {
      expect(classifyProjectFile(repoRoot, file, templatesDir), file.name).toBe('curated');
    }
  });
});

describe('isNonEmptyRepo', () => {
  let dir: string;

  function write(rel: string, content = 'x\n'): void {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }

  function gitInit(): void {
    execFileSync('git', ['init', '-q'], { cwd: dir });
  }

  function writeCodevGenerated(): void {
    write('codev/resources/arch.md');
    write('.codev/config.json', '{}\n');
    write('.claude/skills/x/SKILL.md');
    write('.codex/skills/x/SKILL.md');
    write('CLAUDE.md');
    write('AGENTS.md');
    write('CLAUDE.md.codev-new');
    write('.gitignore', 'build/\n');
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codev-1797-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is empty when only Codev-generated files exist', () => {
    gitInit();
    writeCodevGenerated();
    expect(isNonEmptyRepo(dir)).toBe(false);
  });

  it('is non-empty with one untracked source file and no commits', () => {
    gitInit();
    writeCodevGenerated();
    write('src/index.ts');
    expect(isNonEmptyRepo(dir)).toBe(true);
  });

  it('is empty when the only project file is ignored', () => {
    gitInit();
    writeCodevGenerated();
    write('build/out.js');
    expect(isNonEmptyRepo(dir)).toBe(false);
  });

  it('is non-empty outside git with one source file', () => {
    writeCodevGenerated();
    write('main.py');
    expect(isNonEmptyRepo(dir)).toBe(true);
  });

  it('honours the root .gitignore outside git', () => {
    writeCodevGenerated();
    write('build/out.js');
    expect(isNonEmptyRepo(dir)).toBe(false);
  });
});

describe('classifyProjectGovernance and shouldOfferBootstrap', () => {
  let dir: string;

  function writeResource(name: string, content: string): void {
    fs.mkdirSync(path.join(dir, 'codev', 'resources'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'codev', 'resources', name), content);
  }

  function writeStarters(): void {
    for (const file of GOVERNANCE_FILES) {
      writeResource(file.name, knownStarterTexts(file, templatesDir)[0]);
    }
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codev-1797-offer-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('makes every starter eligible on a fresh adopt', () => {
    writeStarters();
    const names = bootstrapEligibleFiles(classifyProjectGovernance(dir, templatesDir)).map(file => file.name);
    expect(names.sort()).toEqual(GOVERNANCE_FILES.map(file => file.name).sort());
  });

  it('holds back a hot starter whose cold doc is missing', () => {
    writeStarters();
    fs.rmSync(path.join(dir, 'codev', 'resources', 'arch.md'));
    const statuses = classifyProjectGovernance(dir, templatesDir);
    expect(statuses.find(status => status.file.name === 'arch-critical.md')?.heldBack).toContain('arch.md');
    expect(bootstrapEligibleFiles(statuses).map(file => file.name)).not.toContain('arch-critical.md');
  });

  it('never offers when the package skeleton lacks a starter (an offer must not throw)', () => {
    writeStarters();
    fs.writeFileSync(path.join(dir, 'main.py'), 'print(1)\n');
    const emptyTemplates = fs.mkdtempSync(path.join(os.tmpdir(), 'codev-1797-no-starters-'));
    try {
      expect(shouldOfferBootstrap(dir, emptyTemplates)).toBe(false);
    } finally {
      fs.rmSync(emptyTemplates, { recursive: true, force: true });
    }
  });

  it('offers the pass only when a starter remains on a non-empty project', () => {
    writeStarters();
    expect(shouldOfferBootstrap(dir, templatesDir)).toBe(false);
    fs.writeFileSync(path.join(dir, 'main.py'), 'print(1)\n');
    expect(shouldOfferBootstrap(dir, templatesDir)).toBe(true);
    for (const file of GOVERNANCE_FILES) {
      writeResource(file.name, `# ${file.name}\n\n## Real\n\nProject-specific content.\n`);
    }
    expect(shouldOfferBootstrap(dir, templatesDir)).toBe(false);
  });
});

describe('validateHotFile', () => {
  const archCritical = readRepo('codev/resources/arch-critical.md');
  const arch = readRepo('codev/resources/arch.md');

  function kinds(content: string, cold = arch, file = ARCH_CRITICAL): string[] {
    return validateHotFile(content, cold, file).violations.map(v => v.kind);
  }

  it('passes this repo\'s curated hot files (no false positives)', () => {
    const archResult = validateHotFile(archCritical, arch, ARCH_CRITICAL);
    expect(archResult.violations).toEqual([]);
    // arch.md has more than 12 sections: unmapped ones are information only.
    expect(archResult.unmappedSections.length).toBeGreaterThan(0);

    const lessons = validateHotFile(
      readRepo('codev/resources/lessons-critical.md'),
      readRepo('codev/resources/lessons-learned.md'),
      LESSONS_CRITICAL,
    );
    expect(lessons.violations).toEqual([]);
  });

  it('flags a leftover slot line', () => {
    const drafted = archCritical.replace(
      '## Map of arch.md',
      '- <Keep to <=10, one line each; demote weaker facts into arch.md.>\n\n## Map of arch.md',
    );
    expect(kinds(drafted)).toContain('leftover-marker');
  });

  it('flags an 11th fact', () => {
    const drafted = archCritical.replace('\n\n## Map of arch.md', '\n- An eleventh fact.\n\n## Map of arch.md');
    expect(kinds(drafted)).toEqual(['too-many-entries']);
  });

  it('flags a 13th map entry', () => {
    const drafted = `${archCritical.trimEnd()}\n- Glossary — again.\n`;
    // A 13th entry also duplicates a topic, but only the cap is a violation.
    expect(kinds(drafted)).toEqual(['too-many-map-topics']);
  });

  it('flags 36 lines outside comments but ignores comment lines', () => {
    const pad = (n: number) => archCritical.replace('## Map of arch.md', `${'\n'.repeat(n)}## Map of arch.md`);
    const toCap = 35 - nonCommentLineCount(archCritical);
    expect(nonCommentLineCount(pad(toCap))).toBe(35);
    expect(kinds(pad(toCap))).toEqual([]);
    expect(kinds(pad(toCap + 1))).toEqual(['too-many-lines']);

    const commented = archCritical.replace(
      '## Map of arch.md',
      '<!--\nline\nline\nline\nline\n-->\n## Map of arch.md',
    );
    expect(kinds(commented)).toEqual([]);
    expect(nonCommentLineCount(commented)).toBe(nonCommentLineCount(archCritical));
  });

  it('does not count whole-line comment blocks at all', () => {
    expect(nonCommentLineCount('# t\n\n<!-- one\ntwo -->\n\n## S\n')).toBe(4);
    expect(nonCommentLineCount('# t <!-- inline -->\n')).toBe(1);
  });

  it('flags a map entry naming a non-existent section', () => {
    const drafted = archCritical.replace('- Glossary —', '- Deployment Pipeline —');
    expect(kinds(drafted)).toEqual(['unknown-map-section']);
  });

  it('flags a map topic that matches several sections', () => {
    const cold = '## Data Model\nx\n## Data Flow\ny\n';
    const hot = '# h\n\n## Critical facts\n- A fact.\n\n## Map of arch.md (consult when…)\n- Data — when touching data.\n';
    expect(kinds(hot, cold)).toContain('ambiguous-map-section');
    expect(kinds(hot, cold)).not.toContain('unknown-map-section');
  });

  it('accepts a bare map entry and requires full coverage of a small cold doc', () => {
    const cold = '## Services\nx\n## Storage\ny\n';
    const complete = '# h\n\n## Critical facts\n- A fact.\n\n## Map of arch.md (consult when…)\n- Services\n- Storage — when persisting.\n';
    expect(kinds(complete, cold)).toEqual([]);

    const partial = '# h\n\n## Critical facts\n- A fact.\n\n## Map of arch.md (consult when…)\n- Services\n';
    expect(kinds(partial, cold)).toEqual(['unmapped-section']);
  });

  it('lets an exact heading win over a longer heading it prefixes', () => {
    const cold = '## Data\nx\n## Data Flow\ny\n';
    const hot = '# h\n\n## Critical facts\n- A fact.\n\n## Map of arch.md (consult when…)\n- Data — when modelling.\n- Data Flow — when routing.\n';
    expect(kinds(hot, cold)).toEqual([]);
  });

  it('accepts en-dash and hyphen separators in map entries', () => {
    const cold = '## Services\nx\n## Storage Layer\ny\n';
    const hot = '# h\n\n## Critical facts\n- A fact.\n\n## Map of arch.md (consult when…)\n- Services – when routing.\n- Storage Layer - when persisting.\n';
    expect(kinds(hot, cold)).toEqual([]);
  });

  it('flags a missing section', () => {
    const noMap = archCritical.slice(0, archCritical.indexOf('## Map of arch.md'));
    expect(kinds(noMap)).toContain('missing-section');
  });

  it('flags the untouched starter', () => {
    const starter = fs.readFileSync(path.join(templatesDir, 'arch-critical.md'), 'utf-8');
    expect(kinds(starter)).toContain('leftover-marker');
  });
});

describe('starter markers survive whitespace edits', () => {
  it('flags a padded or indented marker left in a cold draft', () => {
    const padded = '# Architecture\n\n## Services\nx\n\n_No architecture documented yet._   \n';
    expect(validateColdFile(padded, true).map(v => v.kind)).toContain('leftover-marker');
    const indented = '# Architecture\n\n  - <Top-level arch.md section> — consult when <situation>.\n';
    expect(validateColdFile(indented, true).map(v => v.kind)).toContain('leftover-marker');
  });
});

describe('knownStarterTexts', () => {
  it('throws when the current starter cannot be found', () => {
    expect(() => knownStarterTexts(ARCH, path.join(os.tmpdir(), 'no-such-templates'))).toThrow(/starter not found/);
  });
});

describe('validateColdFile', () => {
  it('flags starter text left in a cold file', () => {
    const starter = fs.readFileSync(path.join(templatesDir, 'arch.starter.md'), 'utf-8');
    expect(validateColdFile(starter, true).map(v => v.kind)).toContain('leftover-marker');
  });

  it('flags more than 12 sections only for a file the bootstrap wrote', () => {
    const sections = Array.from({ length: 13 }, (_, i) => `## Section ${i}\ntext\n`).join('\n');
    expect(validateColdFile(sections, true).map(v => v.kind)).toEqual(['too-many-cold-sections']);
    expect(validateColdFile(sections, false)).toEqual([]);
  });

  it('flags a written cold file with no top-level sections', () => {
    expect(validateColdFile('# Architecture\n\nProse only.\n', true).map(v => v.kind)).toEqual(['empty-section']);
    expect(validateColdFile('# Architecture\n\nProse only.\n', false)).toEqual([]);
  });
});

describe('slot markers', () => {
  it('does not mistake an autolink bullet for a slot', () => {
    expect(isStarterMarker('- <https://example.com/runbook> — the on-call runbook')).toBe(false);
    expect(isStarterMarker('- <mailto:team@example.com>')).toBe(false);
    expect(isStarterMarker('- <A system-shape fact>')).toBe(true);
  });
});

describe('empty hot sections', () => {
  it('flags a facts section and a map section with no entries', () => {
    const hot = [
      '# arch-critical.md',
      '',
      '## Critical facts (consult before deciding)',
      '',
      '## Map of arch.md (consult when…)',
      '',
    ].join('\n');
    const messages = validateHotFile(hot, '# Architecture\n', ARCH_CRITICAL).violations
      .filter(v => v.kind === 'empty-section')
      .map(v => v.message);
    expect(messages).toEqual([
      '"## Critical facts" has no entries',
      '"## Map of arch.md" has no entries',
    ]);
  });
});

describe('bootstrap prompt template and skill content', () => {
  const PLACEHOLDERS = ['{{SKILL}}', '{{ELIGIBLE_FILES}}', '{{CURATED_FILES}}', '{{GIT_DIGEST}}', '{{PROJECT_NAME}}'];

  it('ships the prompt template with every placeholder exactly once', () => {
    const template = fs.readFileSync(path.join(templatesDir, 'bootstrap-docs-prompt.md'), 'utf-8');
    for (const placeholder of PLACEHOLDERS) {
      expect(template.split(placeholder).length - 1, placeholder).toBe(1);
    }
  });

  it('carries bootstrap-mode and the sensitive-material rule in the update-arch-docs skill', () => {
    const skill = readRepo('codev-skeleton/.claude/skills/update-arch-docs/SKILL.md');
    expect(skill).toContain('## Mode: bootstrap-mode');
    expect(skill).toContain('**Sensitive material.**');
    expect(skill).toContain('The seeded universal lessons survive.');
  });
});
