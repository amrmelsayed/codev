/**
 * `codev bootstrap-docs` (Spec 1797): draft the four governance docs from an existing
 * codebase, in place of the starter placeholders `codev adopt` leaves behind.
 *
 * The CLI owns everything deterministic: which files are still untouched starters, whether
 * there is anything to document, the launch, the before/after change report, validation of
 * the drafts and the summary. The agent owns only the writing, under the rules of the
 * `update-arch-docs` skill's bootstrap mode, which is inlined into its prompt.
 *
 * An interactive agent cannot be sandboxed from here, so the guarantee is detect-and-report:
 * anything that moved outside the eligible files is named and the exit code is non-zero.
 * Nothing is ever reverted, staged or committed; the drafts are the human's to review.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import chalk from 'chalk';
import { confirm } from '../lib/cli-prompts.js';
import { loadConfig } from '../lib/config.js';
import { getTemplatesDir } from '../lib/templates.js';
import {
  GOVERNANCE_FILES,
  classifyProjectFile,
  isNonEmptyRepo,
  topLevelHeadings,
  validateColdFile,
  validateHotFile,
  HOT_CAP_MAP_TOPICS,
  type GovernanceClass,
  type GovernanceFile,
  type Violation,
} from '../lib/governance-bootstrap.js';
import {
  FILESYSTEM_WALK_LIMIT,
  FILESYSTEM_WALK_SKIPPED,
  diffRepositoryIdentity,
  diffSnapshotEntries,
  escapeControlChars,
  hashPath,
  readIndexFingerprint,
  snapshotFilesystem,
  snapshotTree,
  type IdentityChange,
  type TreeSnapshot,
} from '../lib/tree-snapshot.js';
import { CONSULT_OWNED_PREFIXES } from './consult/tree-tripwire.js';
import {
  resolveInteractiveTaskLauncher,
  type CustomHarnessConfig,
  type InteractiveTaskLauncher,
} from '../agent-farm/utils/harness.js';

/** Where the rendered prompt is saved, for the manual fallback and for the record. */
export const PROMPT_FILE = '.consult/bootstrap-docs/prompt.md';

/** Bounds of the git-log survey inlined into the prompt (see the plan's Executive Summary). */
const RECENT_COMMITS = 300;
const TARGETED_COMMITS = 150;
const TARGETED_PATTERN = 'fix|revert|hotfix|incident|regression|rollback|outage|security';
const NO_HISTORY = 'No commit history; work from the code alone.';

/**
 * Largest prompt passed as a command-line argument. Linux caps one argument at 128 KB
 * (MAX_ARG_STRLEN); above this the prompt goes to the manual fallback instead of failing
 * the spawn with E2BIG.
 */
export const MAX_PROMPT_BYTES = 100_000;

/**
 * Paths the agent harness itself writes during an ordinary session. Still reported (the spec
 * allows no exemption beyond the eligible files and `.consult/`), but annotated so the human
 * can judge them quickly.
 */
const HARNESS_SCRATCH_PATHS: Record<string, string> = {
  '.claude/settings.local.json': 'written by the agent harness itself, usually benign',
};

export interface BootstrapDocsOptions {
  /** Project root; defaults to the current directory. */
  cwd?: string;
  /** Report eligibility and the resolved launch, launch nothing, write nothing. */
  dryRun?: boolean;
}

export interface AgentLaunch {
  executable: string;
  args: string[];
}

export interface AgentExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** Set when the process could not be started at all. */
  error?: string;
}

/** Seams for tests: the agent, the prompt and the environment are all replaceable. */
export interface BootstrapDocsDeps {
  /** Root of the packaged skeleton (holds `templates/` and the skill copies). */
  skeletonDir: string;
  resolveLauncher(root: string): InteractiveTaskLauncher;
  isExecutableAvailable(executable: string): boolean;
  confirm(question: string): Promise<boolean>;
  stdinIsTTY: boolean;
  spawnAgent(launch: AgentLaunch, cwd: string): Promise<AgentExit>;
  log(line: string): void;
}

export type BootstrapOutcome =
  | 'no-codev'
  | 'nothing-eligible'
  | 'empty-repo'
  | 'dry-run'
  | 'manual'
  | 'declined'
  | 'ran';

export interface FileStatus {
  file: GovernanceFile;
  class: GovernanceClass;
  /** Why a placeholder is not rewritten this run (its paired cold doc is missing). */
  heldBack?: string;
}

export interface DraftValidation {
  name: string;
  /** `unwritten`: still a placeholder after the session; `deleted`: the file is gone. */
  state: 'written' | 'unwritten' | 'deleted';
  violations: Violation[];
  /** Cold sections the map leaves out, listed as information when the cold doc has > 12. */
  unmappedInfo: string[];
}

export interface OutOfScopeChange {
  path: string;
  annotation?: string;
}

export interface ChangeReport {
  /** Governance files that were not eligible but changed (curated, missing, held back). */
  governanceChanged: string[];
  identityChanges: IdentityChange[];
  indexChanged: boolean;
  outOfScope: OutOfScopeChange[];
  /** Set when the tree could be read before the session and not after. */
  detectionLost?: string;
  /** The detector's scope, stated in every summary. */
  scope: string;
}

export interface BootstrapDocsResult {
  exitCode: number;
  outcome: BootstrapOutcome;
  files: FileStatus[];
  launched: boolean;
  agentExit?: AgentExit;
  report?: ChangeReport;
  validation?: DraftValidation[];
}

function governancePath(name: string): string {
  return `codev/resources/${name}`;
}

// =============================================================================
// Prompt
// =============================================================================

function gitOutput(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

/**
 * The bounded history survey: the last 300 commit subjects plus up to 150 incident-shaped
 * subjects from full history, de-duplicated. A repository with no commits (or no git) gets
 * an explicit "work from the code alone" instead of a failing `git log`.
 */
export function buildGitDigest(root: string): string {
  if (gitOutput(root, ['rev-parse', '--verify', '--quiet', 'HEAD']) === null) return NO_HISTORY;

  const format = ['--no-merges', '--format=%h %ad %s', '--date=short'];
  const recent = (gitOutput(root, ['log', ...format, '-n', String(RECENT_COMMITS)]) ?? '')
    .split('\n')
    .filter(line => line !== '');
  const seen = new Set(recent);
  const targeted = (gitOutput(root, ['log', ...format, '-i', '-E', `--grep=${TARGETED_PATTERN}`, '-n', String(TARGETED_COMMITS)]) ?? '')
    .split('\n')
    .filter(line => line !== '' && !seen.has(line));

  if (recent.length === 0) return NO_HISTORY;
  const sections = [`Recent commits (newest first, up to ${RECENT_COMMITS}):`, ...recent];
  if (targeted.length > 0) {
    sections.push('', `Older fix / revert / incident commits (up to ${TARGETED_COMMITS}):`, ...targeted);
  }
  return sections.join('\n');
}

/**
 * Fill `{{NAME}}` placeholders in one pass, so text inserted for one placeholder (the skill
 * text in particular) is never itself scanned for placeholders.
 */
export function renderPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}

function fileList(names: string[]): string {
  if (names.length === 0) return '(none)';
  return names.map(name => `- \`${governancePath(name)}\``).join('\n');
}

function buildPrompt(root: string, skeletonDir: string, eligible: string[], curated: string[]): string {
  const template = fs.readFileSync(path.join(skeletonDir, 'templates', 'bootstrap-docs-prompt.md'), 'utf-8');
  const skill = fs.readFileSync(path.join(skeletonDir, '.claude', 'skills', 'update-arch-docs', 'SKILL.md'), 'utf-8');
  return renderPrompt(template, {
    PROJECT_NAME: path.basename(root),
    ELIGIBLE_FILES: fileList(eligible),
    CURATED_FILES: fileList(curated),
    GIT_DIGEST: buildGitDigest(root),
    SKILL: skill.trim(),
  });
}

// =============================================================================
// Default environment
// =============================================================================

function resolveConfiguredLauncher(root: string): InteractiveTaskLauncher {
  let config;
  try {
    config = loadConfig(root);
  } catch (err) {
    return { supported: false, reason: `.codev/config.json could not be loaded: ${(err as Error).message}` };
  }
  return resolveInteractiveTaskLauncher(
    config.shell?.architect ?? 'claude',
    config.shell?.architectHarness,
    config.harness as Record<string, CustomHarnessConfig> | undefined,
  );
}

function isExecutableOnPath(executable: string): boolean {
  const canRun = (candidate: string): boolean => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  };
  if (executable.includes('/') || executable.includes(path.sep)) return canRun(executable);
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (dir === '') continue;
    for (const ext of extensions) {
      if (canRun(path.join(dir, executable + ext))) return true;
    }
  }
  return false;
}

/**
 * Run the agent on this terminal and wait for it to exit.
 *
 * Ctrl-C reaches the whole foreground process group, so while the agent owns the terminal
 * this process ignores SIGINT; otherwise interrupting the agent would kill the CLI before it
 * could report what the session changed.
 */
function spawnAgentProcess(launch: AgentLaunch, cwd: string): Promise<AgentExit> {
  const ignoreInterrupt = (): void => {};
  process.on('SIGINT', ignoreInterrupt);
  return new Promise<AgentExit>(resolve => {
    const child = spawn(launch.executable, launch.args, { stdio: 'inherit', cwd });
    child.on('error', err => resolve({ code: null, signal: null, error: err.message }));
    child.on('exit', (code, signal) => resolve({ code, signal }));
  }).finally(() => {
    process.off('SIGINT', ignoreInterrupt);
  });
}

/** Defaults for every seam but `skeletonDir`, which is resolved only when not overridden. */
function defaultDeps(): Omit<BootstrapDocsDeps, 'skeletonDir'> {
  return {
    resolveLauncher: resolveConfiguredLauncher,
    isExecutableAvailable: isExecutableOnPath,
    confirm: question => confirm(question, false),
    stdinIsTTY: Boolean(process.stdin.isTTY),
    spawnAgent: spawnAgentProcess,
    log: line => console.log(line),
  };
}

// =============================================================================
// Change detection
// =============================================================================

type Detector = { mode: 'git' | 'filesystem'; snapshot: TreeSnapshot; index: string | null };

function takeSnapshot(root: string, mode?: Detector['mode']): Detector {
  if (mode !== 'filesystem') {
    const snapshot = snapshotTree(root);
    if (snapshot.available || mode === 'git') {
      return { mode: 'git', snapshot, index: readIndexFingerprint(root) };
    }
  }
  return { mode: 'filesystem', snapshot: snapshotFilesystem(root), index: null };
}

function hashGovernanceFiles(root: string): Map<string, string> {
  return new Map(GOVERNANCE_FILES.map(file => [file.name, hashPath(path.join(root, governancePath(file.name)))]));
}

function detectorScope(before: Detector, after: Detector): string {
  if (before.mode === 'git') {
    return 'Change detection covered the git state and every tracked or untracked path git does not ignore; gitignored paths are not watched.';
  }
  if (before.snapshot.truncated || after.snapshot.truncated) {
    return `Not a git repository, and the tree holds more than ${FILESYSTEM_WALK_LIMIT.toLocaleString('en-US')} files, so change detection covered only the four governance files.`;
  }
  const skipped = FILESYSTEM_WALK_SKIPPED.map(dir => `${dir}/`).join(', ');
  return `Not a git repository: change detection walked every file except ${skipped} and paths the root .gitignore ignores (a repository created during the session is not seen).`;
}

function buildChangeReport(
  eligible: Set<string>,
  before: Detector,
  after: Detector,
  hashesBefore: Map<string, string>,
  hashesAfter: Map<string, string>,
): ChangeReport {
  const governanceChanged = GOVERNANCE_FILES
    .filter(file => !eligible.has(file.name) && hashesBefore.get(file.name) !== hashesAfter.get(file.name))
    .map(file => governancePath(file.name));

  const governancePaths = new Set(GOVERNANCE_FILES.map(file => governancePath(file.name)));
  const eligiblePaths = new Set([...eligible].map(governancePath));
  const isExempt = (rel: string): boolean =>
    eligiblePaths.has(rel) ||
    // Reported above, by content hash, which also sees clean tracked files.
    governancePaths.has(rel) ||
    CONSULT_OWNED_PREFIXES.some(prefix => rel.startsWith(prefix));

  const report: ChangeReport = {
    governanceChanged,
    identityChanges: [],
    indexChanged: false,
    outOfScope: [],
    scope: detectorScope(before, after),
  };

  if (before.snapshot.available && !after.snapshot.available) {
    report.detectionLost = after.snapshot.reason ?? 'unknown';
    return report;
  }
  if (before.snapshot.truncated || after.snapshot.truncated) return report;

  report.outOfScope = diffSnapshotEntries(before.snapshot, after.snapshot, isExempt).map(rel => {
    const annotation = HARNESS_SCRATCH_PATHS[rel];
    if (annotation) return { path: rel, annotation };
    return { path: rel };
  });
  report.identityChanges = diffRepositoryIdentity(before.snapshot, after.snapshot);
  report.indexChanged = before.index !== null && after.index !== null && before.index !== after.index;
  return report;
}

function reportHasChanges(report: ChangeReport): boolean {
  return (
    report.governanceChanged.length > 0 ||
    report.identityChanges.length > 0 ||
    report.indexChanged ||
    report.outOfScope.length > 0 ||
    report.detectionLost !== undefined
  );
}

// =============================================================================
// Validation
// =============================================================================

function readIfExists(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

function validateDrafts(root: string, eligible: GovernanceFile[], templatesDir: string): DraftValidation[] {
  return eligible.map(file => {
    const content = readIfExists(path.join(root, governancePath(file.name)));
    if (content === null) return { name: file.name, state: 'deleted', violations: [], unmappedInfo: [] };
    if (classifyProjectFile(root, file, templatesDir) === 'placeholder') {
      return { name: file.name, state: 'unwritten', violations: [], unmappedInfo: [] };
    }
    if (file.kind === 'cold') {
      return { name: file.name, state: 'written', violations: validateColdFile(content, true), unmappedInfo: [] };
    }
    const cold = readIfExists(path.join(root, governancePath(file.coldDoc!))) ?? '';
    const { violations, unmappedSections } = validateHotFile(content, cold, file);
    let unmappedInfo: string[] = [];
    if (topLevelHeadings(cold).length > HOT_CAP_MAP_TOPICS) unmappedInfo = unmappedSections;
    return { name: file.name, state: 'written', violations, unmappedInfo };
  });
}

// =============================================================================
// Output
// =============================================================================

const CLASS_LABEL: Record<GovernanceClass, string> = {
  placeholder: 'placeholder (eligible)',
  curated: 'curated (read as input, not edited)',
  missing: 'missing (run `codev update` to restore the starter, then re-run)',
};

function printFileStatuses(log: (line: string) => void, files: FileStatus[]): void {
  for (const status of files) {
    let label = CLASS_LABEL[status.class];
    if (status.heldBack) label = `placeholder, held back: ${status.heldBack}`;
    log(`  ${governancePath(status.file.name)}: ${label}`);
  }
}

function quoteArg(arg: string): string {
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** The launch as a command line, with the (long) prompt argument shown by reference. */
function describeLaunch(launch: AgentLaunch, prompt: string): string {
  const args = launch.args.map(arg => {
    if (arg === prompt) return `"$(cat ${PROMPT_FILE})"`;
    return quoteArg(arg);
  });
  return [quoteArg(launch.executable), ...args].join(' ');
}

/** Flags (or `--flag=value` forms) that let the agent act without asking. */
const BYPASS_FLAGS = [
  '--dangerously-skip-permissions',
  '--dangerously-bypass-approvals-and-sandbox',
  '--yolo',
  '--permission-mode=bypassPermissions',
];
const PERMISSION_FLAG = /dangerously|bypass|yolo|full-auto|permission|approval|sandbox/i;

function describePermissions(launch: AgentLaunch, prompt: string): string {
  const flags: string[] = [];
  const args = launch.args.filter(arg => arg !== prompt);
  for (let i = 0; i < args.length; i++) {
    if (!PERMISSION_FLAG.test(args[i])) continue;
    // Keep a separate value with its flag (`--permission-mode plan`).
    if (!args[i].includes('=') && args[i + 1] !== undefined && !args[i + 1].startsWith('-')) {
      flags.push(`${args[i]}=${args[i + 1]}`);
      i++;
    } else {
      flags.push(args[i]);
    }
  }
  if (flags.length === 0) return 'Permission mode: the agent CLI\'s default (it asks before running commands or editing files).';
  if (flags.some(flag => BYPASS_FLAGS.includes(flag))) {
    return `Permission mode from your config: ${flags.join(' ')} (the agent will NOT ask before running commands or editing files).`;
  }
  return `Permission flags from your config: ${flags.join(' ')} (see your agent's documentation for what they allow).`;
}

function printSummary(
  log: (line: string) => void,
  validation: DraftValidation[],
  report: ChangeReport,
  agentExit: AgentExit,
): void {
  log('');
  log(chalk.bold('Bootstrap summary'));

  if (agentExit.error) {
    log(chalk.red(`  Agent could not be started: ${agentExit.error}`));
    log(`  The prompt is saved at ${PROMPT_FILE} if you would rather run it in your own agent.`);
  } else if (agentExit.signal) {
    log(chalk.red(`  Agent was terminated by ${agentExit.signal}.`));
  } else if (agentExit.code !== 0) {
    log(chalk.red(`  Agent exited with status ${agentExit.code}.`));
  }

  log('  Drafts:');
  for (const draft of validation) {
    const rel = governancePath(draft.name);
    if (draft.state === 'deleted') {
      log(chalk.red(`    ✗ ${rel}: deleted during the session (not written)`));
    } else if (draft.state === 'unwritten') {
      log(chalk.red(`    ✗ ${rel}: still the starter placeholder (not written)`));
    } else if (draft.violations.length === 0) {
      log(chalk.green(`    ✓ ${rel}: written, validation passed`));
    } else {
      log(chalk.red(`    ✗ ${rel}: written, ${draft.violations.length} validation problem(s):`));
      for (const violation of draft.violations) log(`        - ${escapeControlChars(violation.message)}`);
    }
    if (draft.unmappedInfo.length > 0) {
      log(`      info: cold sections not in the map (allowed above ${HOT_CAP_MAP_TOPICS}): ${draft.unmappedInfo.map(escapeControlChars).join(', ')}`);
    }
  }

  if (reportHasChanges(report)) {
    log(chalk.red('  Changes outside the eligible files (nothing has been reverted):'));
    for (const rel of report.governanceChanged) log(chalk.red(`    - ${rel} (governance file that was not eligible)`));
    for (const change of report.identityChanges) {
      log(chalk.red(`    - ${change.field} moved: ${escapeControlChars(change.before)} -> ${escapeControlChars(change.after)} (check \`git reflog\`)`));
    }
    if (report.indexChanged) log(chalk.red('    - the git index changed (check `git diff --cached`)'));
    for (const change of report.outOfScope) {
      let line = `    - ${escapeControlChars(change.path)}`;
      if (change.annotation) line += ` (${change.annotation})`;
      log(chalk.red(line));
    }
    if (report.detectionLost !== undefined) {
      log(chalk.red(`    - the working tree could not be read after the session (${escapeControlChars(report.detectionLost)}); whether anything else changed is unknown`));
    }
  } else {
    log('  No changes outside the eligible files.');
  }
  log(`  ${report.scope}`);

  log('');
  if (report.identityChanges.length > 0 || report.indexChanged) {
    log(chalk.yellow('Review before commit — Codev staged and committed nothing, but git state moved during the session (see above).'));
    log('  Check `git log` and `git diff --cached` before trusting what is staged or committed.');
  } else {
    log(chalk.yellow('Review before commit — nothing has been staged or committed.'));
  }
  log(`  Inspect the drafts with \`git diff\` (or open them), edit as needed, then commit them yourself.`);
}

// =============================================================================
// Command
// =============================================================================

export async function runBootstrapDocs(
  options: BootstrapDocsOptions = {},
  overrides: Partial<BootstrapDocsDeps> = {},
): Promise<BootstrapDocsResult> {
  const deps: BootstrapDocsDeps = {
    ...defaultDeps(),
    ...overrides,
    skeletonDir: overrides.skeletonDir ?? getTemplatesDir(),
  };
  const { log } = deps;
  const root = path.resolve(options.cwd ?? process.cwd());
  const templatesDir = path.join(deps.skeletonDir, 'templates');

  if (!fs.existsSync(path.join(root, 'codev'))) {
    log(chalk.red(`No codev/ directory in ${root}. Run \`codev adopt\` first, then re-run \`codev bootstrap-docs\` here.`));
    return { exitCode: 1, outcome: 'no-codev', files: [], launched: false };
  }

  const files: FileStatus[] = GOVERNANCE_FILES.map(file => ({
    file,
    class: classifyProjectFile(root, file, templatesDir),
  }));
  // A hot map is built from its cold doc's sections; with the cold doc missing there is
  // nothing to build it from, so the hot file waits for `codev update` too.
  for (const status of files) {
    if (status.class !== 'placeholder' || !status.file.coldDoc) continue;
    const cold = files.find(other => other.file.name === status.file.coldDoc);
    if (cold?.class === 'missing') status.heldBack = `${status.file.coldDoc} is missing`;
  }
  const eligible = files.filter(status => status.class === 'placeholder' && !status.heldBack).map(status => status.file);
  const curated = files.filter(status => status.class === 'curated').map(status => status.file.name);

  log(chalk.bold('Governance docs:'));
  printFileStatuses(log, files);

  if (eligible.length === 0) {
    log('');
    log('Nothing needs bootstrapping: no governance file is still an untouched starter.');
    if (files.some(status => status.class === 'missing')) {
      log('Missing files are not created here: run `codev update` to restore their starters, then re-run.');
    }
    return { exitCode: 0, outcome: 'nothing-eligible', files, launched: false };
  }

  if (!isNonEmptyRepo(root)) {
    log('');
    log('This project holds nothing beyond the files Codev generated, so there is nothing to document yet.');
    log('The placeholders stay; they fill in through review phases as work happens.');
    return { exitCode: 0, outcome: 'empty-repo', files, launched: false };
  }

  const launcher = deps.resolveLauncher(root);
  let unavailable: string | undefined;
  if (!launcher.supported) {
    unavailable = launcher.reason;
  } else {
    const executable = launcher.buildLaunch('').executable;
    if (!deps.isExecutableAvailable(executable)) unavailable = `"${executable}" was not found on PATH`;
  }

  if (options.dryRun) {
    log('');
    if (launcher.supported && !unavailable) {
      const launch = launcher.buildLaunch('<bootstrap prompt>');
      log(`Would launch (${launcher.harnessName}): ${[launch.executable, ...launch.args.map(quoteArg)].join(' ')}`);
    } else {
      log(`Would not launch an agent: ${unavailable}.`);
      log(`Would write the prompt to ${PROMPT_FILE} for you to run in your own agent.`);
    }
    log('Dry run: nothing launched, nothing written.');
    return { exitCode: 0, outcome: 'dry-run', files, launched: false };
  }

  const prompt = buildPrompt(root, deps.skeletonDir, eligible.map(file => file.name), curated);
  const promptPath = path.join(root, PROMPT_FILE);
  fs.mkdirSync(path.dirname(promptPath), { recursive: true });
  fs.writeFileSync(promptPath, prompt);

  const promptBytes = Buffer.byteLength(prompt);
  if (!unavailable && promptBytes > MAX_PROMPT_BYTES) {
    unavailable = `the prompt is ${Math.ceil(promptBytes / 1000)} KB, too long to pass as a command-line argument (limit ${MAX_PROMPT_BYTES / 1000} KB)`;
  }

  if (!launcher.supported || unavailable) {
    log('');
    log(chalk.yellow(`Not launching an agent: ${unavailable}.`));
    log(`The bootstrap prompt is saved at ${PROMPT_FILE}. To draft the docs yourself:`);
    log('  1. Open your agent in this directory.');
    log(`  2. Give it the contents of ${PROMPT_FILE} as its first message.`);
    log('  3. Review the drafts before committing; the placeholders stay until it writes them.');
    return { exitCode: 0, outcome: 'manual', files, launched: false };
  }

  const launch = launcher.buildLaunch(prompt);
  const command = describeLaunch(launch, prompt);
  log('');
  log(chalk.bold('About to launch an agent session to draft the governance docs:'));
  log(`  Command: ${command}`);
  log('  It reads the codebase and the git log (a bounded digest is included in its prompt).');
  log(`  It may write only: ${eligible.map(file => governancePath(file.name)).join(', ')}`);
  log('  It consumes model quota on your agent account.');
  log(`  ${describePermissions(launch, prompt)}`);
  log('  When it says the drafts are done, exit the session; Codev then checks what changed.');

  if (!deps.stdinIsTTY) {
    log('');
    log('Standard input is not a terminal, so the launch is declined. Run it interactively:');
    log('  codev bootstrap-docs');
    log(`The prompt is saved at ${PROMPT_FILE} if you would rather run it in your own agent.`);
    return { exitCode: 0, outcome: 'declined', files, launched: false };
  }
  if (!(await deps.confirm('Launch the agent now?'))) {
    log('Declined; nothing launched. The placeholders are unchanged.');
    log(`The prompt is saved at ${PROMPT_FILE} if you would rather run it in your own agent.`);
    return { exitCode: 0, outcome: 'declined', files, launched: false };
  }

  const eligibleNames = new Set(eligible.map(file => file.name));
  const hashesBefore = hashGovernanceFiles(root);
  const before = takeSnapshot(root);

  const agentExit = await deps.spawnAgent(launch, root);

  const after = takeSnapshot(root, before.mode);
  const hashesAfter = hashGovernanceFiles(root);
  const report = buildChangeReport(eligibleNames, before, after, hashesBefore, hashesAfter);
  const validation = validateDrafts(root, eligible, templatesDir);

  printSummary(log, validation, report, agentExit);

  const agentFailed = agentExit.error !== undefined || agentExit.signal !== null || agentExit.code !== 0;
  const draftsFailed = validation.some(draft => draft.state !== 'written' || draft.violations.length > 0);
  let exitCode = 0;
  if (agentFailed || draftsFailed || reportHasChanges(report)) exitCode = 1;

  return { exitCode, outcome: 'ran', files, launched: true, agentExit, report, validation };
}

/** CLI entry: run the pass and hand back the process exit code. */
export async function bootstrapDocs(options: BootstrapDocsOptions = {}): Promise<number> {
  const result = await runBootstrapDocs(options);
  return result.exitCode;
}
