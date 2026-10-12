# Plan: Bootstrap the governance docs from an existing codebase

**Specification**: [codev/specs/1797-adopt-bootstrap-the-governance.md](../specs/1797-adopt-bootstrap-the-governance.md)

## Executive Summary

The spec selects **Approach 2 with Approach 4 as its content half**: a dedicated, re-runnable
`codev bootstrap-docs` subcommand that owns everything deterministic (per-file eligibility,
launch, change detection, validation, consult, summary), and a new **bootstrap mode** in the
`update-arch-docs` skill that owns the content contract. `codev adopt` offers the command at
the end (after any conflict-merge session has exited); `codev update` prints a hint.

The work splits into five phases, ordered so each builds only on finished, tested pieces:

1. Pure library: placeholder classifier, non-empty-repo rule, hot/cold validator.
2. Content: skill bootstrap mode + sensitive-material rejection (four copies) and the
   bootstrap prompt template (both trees).
3. Harness capability: "launch interactively with an initial task prompt", Claude + Codex.
4. The `codev bootstrap-docs` command: orchestration, change detection, consult, summary.
5. `adopt` / `update` integration and user docs.

Decisions this plan makes that the spec deferred:

- **Git-log window (spec OQ5).** The CLI computes the survey itself, so the bound is
  deterministic rather than left to the agent: the last **300** commit subjects
  (`git log --no-merges --format='%h %ad %s' --date=short -n 300`) plus up to **150**
  targeted subjects matching `fix|revert|hotfix|incident|regression|rollback|outage|security`
  (case-insensitive, `--all-match` off, `-n 150`) from full history, de-duplicated. The digest
  is inlined into the prompt. The agent may run further targeted `git show`/`git log -S` on
  specific commits but the prompt tells it not to walk the full log. No commits → the digest
  says so and the agent works from code alone.
- **Harness support (spec OQ2).** Verified empirically on 2026-10-13: `claude --help` and
  `codex --help` both document an optional positional `[PROMPT]` that starts the
  **interactive** session with that prompt (Claude's existing adopt merge launch already relies
  on this). Those two built-ins get the capability. OpenCode (builder-only harness, not
  installed for verification) and custom harnesses do not; they take the prompt-file fallback.
- **Known earlier starters.** From git history, the only earlier starter text is the pre-#1012
  cold variant (same lines, no `STARTER:` comment; commits `8ef441cc2`/`9fa9c2316`). Both it
  and the current starters predate the v3.2.0 tag, so only the current starters ever shipped
  in a release; the pre-#1012 variant is included anyway because it costs nothing and
  pre-release builds carried it. The hot starters have a single version (`1a8c63b27`).
- **Seeded universal lessons survive (architect addition at the spec gate).** The three
  universal lessons shipped in `lessons-critical.md` are carried into the bootstrapped hot
  file and are only displaced by a project-specific lesson when the 10-entry cap would
  otherwise be exceeded; a displaced one is demoted into `lessons-learned.md`, never dropped.
  This lives in the skill's bootstrap mode and the prompt (content), not the validator (which
  stays mechanical).
- **Prompt delivery.** The CLI inlines the skill's full `SKILL.md` text (read from the
  installed package skeleton via `getTemplatesDir()`'s sibling skill path, not from the
  adopter's repo) into the prompt, per the runtime-resolution rule. The agent is not told to
  fetch any `codev/...` framework path.
- **Fallback prompt file** goes to `.consult/bootstrap-docs/prompt.md` (gitignored, already
  exempt from the change detector), alongside the consult outputs.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Governance-doc classifier and validator library"},
    {"id": "phase_2", "title": "Skill bootstrap mode and bootstrap prompt template"},
    {"id": "phase_3", "title": "Harness capability for interactive task launch"},
    {"id": "phase_4", "title": "codev bootstrap-docs command"},
    {"id": "phase_5", "title": "adopt and update integration plus docs"}
  ]
}
```

## Phase Breakdown

### Phase 1: Governance-doc classifier and validator library

**Dependencies**: None

#### Objective

All deterministic judgement the command needs, as pure, unit-tested functions with no I/O
beyond reading files and (for the repo rule) running `git ls-files`. Everything later phases
decide about eligibility and validity comes from here.

#### Files to Create / Modify

- Create `packages/codev/src/lib/governance-bootstrap.ts`
- Create `packages/codev/src/__tests__/governance-bootstrap.test.ts`
- Modify `packages/codev/src/lib/scaffold.ts` only if a shared constant (the four file names /
  starter source mapping) needs exporting; `HOT_TIER_FILES` and `COLD_TIER_FILES` are reused
  as-is.

#### Deliverables

- [ ] `GOVERNANCE_FILES`: the four files with kind (`hot`/`cold`), their starter source(s),
      and for hot files the paired cold doc.
- [ ] `knownStarterTexts(file, templatesDir)`: current skeleton starter + the pre-#1012 cold
      variant (embedded as a constant with a comment citing the commits).
- [ ] `classifyGovernanceFile(content, starters)` → `'missing' | 'placeholder' | 'curated'`
      implementing the spec predicate exactly: every non-blank line (trimmed-right) appears
      verbatim in some known starter, **and** at least one starter marker is present
      (`_No … yet._` line, `- <…>` slot line, or a line containing `STARTER:`). Any doubt ⇒
      `curated`. `missing` is reported separately (the command treats a missing file as
      eligible only because adopt/update would have created the starter; see Phase 4).
- [ ] `isNonEmptyRepo(root)`: `git ls-files --cached --others --exclude-standard -z` inside
      a git work tree; otherwise a filesystem walk honouring `.gitignore` at the root plus the
      fixed Codev-generated exclusions (`codev/`, `.codev/`, `.claude/`, `.codex/`,
      `CLAUDE.md`, `AGENTS.md`, `*.codev-new`, `.gitignore`, and `.git/`). Submodule gitlinks
      count as files (they appear in `ls-files`).
- [ ] `validateHotFile(content, coldContent, kind)` → list of typed violations:
      leftover marker (slot line, `_No … yet._`, `STARTER:`); facts/lessons section > 10
      `- ` entries; map section > 12 `- ` entries; > 35 lines excluding HTML-comment lines;
      missing required section; map entry not starting with a real `## ` section name of
      the cold doc. Plus informational `unmappedSections` (always computed; a violation only
      when the cold doc has ≤ 12 top-level sections).
- [ ] `validateColdFile(content)` → leftover markers; > 12 top-level sections flagged only
      when the file was written by the pass (caller passes a flag).
- [ ] Map-entry matching rule documented in code: an entry matches a section when the entry
      text, after `- `, starts with the section heading text followed by a non-word
      boundary (e.g. ` — `, ` -`, `:`), compared case-sensitively after trimming.

#### Acceptance Criteria

- [ ] Shipped starters (all four, plus the pre-#1012 cold variant) classify as `placeholder`.
- [ ] `lessons-critical.md` exactly as shipped (three seeded lessons) is `placeholder`.
- [ ] A starter with one added real line, or with one slot line edited, is `curated`.
- [ ] A starter with all markers removed but no other edits is `curated` (no marker ⇒ doubt).
- [ ] This repo's `codev/resources/arch-critical.md` + `arch.md` and
      `lessons-critical.md` + `lessons-learned.md` produce **no** violations (spec scenario 12;
      `arch.md` has 19 sections, so unmapped sections appear as information only).
- [ ] Each of: leftover slot, 11th fact, 13th map entry, 36 non-comment lines, map entry
      naming a non-existent section produces exactly the expected violation (scenario 11).
- [ ] `isNonEmptyRepo`: only Codev-generated files ⇒ false; one untracked source file in a
      repo with no commits ⇒ true; an ignored file only ⇒ false; non-git directory with one
      source file ⇒ true.
- [ ] `pnpm build` and the package test suite pass; `tsc` type check passes.

#### Test Plan

Unit tests in `governance-bootstrap.test.ts` using temp directories (`fs.mkdtempSync`) and
real `git init` for the repo rule, reading starters from the built skeleton
(`packages/codev/skeleton`, so run `pnpm build` first). Fixtures for over-cap and bad-map
cases are built inline from the real arch-critical file with targeted edits.

---

### Phase 2: Skill bootstrap mode and bootstrap prompt template

**Dependencies**: Phase 1 (the prompt template names the validator's rules; the skill text
must match them)

#### Objective

Own the content contract in one place. The `update-arch-docs` skill gains a third mode
(bootstrap) and a new bright-line rejection for sensitive material that applies to all modes.
A prompt template packages the per-run instructions the CLI fills in.

#### Files to Create / Modify

- Modify all four skill copies identically:
  - `.claude/skills/update-arch-docs/SKILL.md`
  - `.codex/skills/update-arch-docs/SKILL.md`
  - `codev-skeleton/.claude/skills/update-arch-docs/SKILL.md`
  - `codev-skeleton/.codex/skills/update-arch-docs/SKILL.md`
- Create `codev-skeleton/templates/bootstrap-docs-prompt.md` and its instance mirror
  `codev/templates/bootstrap-docs-prompt.md` (two-tree rule; `codev/templates/` already
  mirrors the skeleton templates).
- Modify `packages/codev/src/__tests__/skill-parity.test.ts` only if it enumerates skill
  content rather than diffing copies (verify first; expected: no change needed).

#### Deliverables

- [ ] Skill frontmatter description: "Three modes" (diff, audit, bootstrap), bootstrap
      named as the first-population mode for an adopted codebase.
- [ ] New section `## Mode: bootstrap-mode (first population from a codebase)`:
  - survey order: build wiring / package manifests, entry points, process and service
    boundaries, persistence, transports, then the git-log digest supplied by the caller;
  - write only the files the caller lists as eligible; read curated governance files as
    input (a curated `arch.md` drives the map of a placeholder `arch-critical.md`);
  - cold `arch.md`: current system shape, ≤ 12 top-level `## ` sections, no file lists,
    no history, nothing aspirational;
  - cold `lessons-learned.md`: lessons evidenced by scar tissue (fix/revert/incident commits,
    "never do X" comments, recurring bug classes), each traceable to evidence; thin is
    acceptable, invented is not; organised in ≤ 12 top-level sections;
  - hot files: the exact shape from the spec's definitions (title, guidance comment with the
    `STARTER:` sentence removed, facts/lessons section, map section), ≤ 10 entries, map
    built from the cold doc's real top-level sections;
  - **seeded universal lessons survive**: the three seeded lessons stay in
    `lessons-critical.md` unless a project-specific lesson needs the slot under the cap; a
    displaced one is demoted into `lessons-learned.md`;
  - remove every slot line, `_No … yet._` line and `STARTER:` text from files it writes;
  - never commit, stage, or touch any other path; say clearly when done and ask the user to
    exit the session so the CLI can validate.
- [ ] New bright-line rejection under "What this skill does NOT do → In either file":
      no credentials, tokens, keys, internal hostnames/endpoints, connection strings, or
      customer data in any governance doc (all modes).
- [ ] Prompt template with placeholders the CLI fills: `{{SKILL}}` (full skill text),
      `{{ELIGIBLE_FILES}}`, `{{CURATED_FILES}}`, `{{GIT_DIGEST}}`, `{{PROJECT_NAME}}`, and a
      closing instruction block (writable paths only, exit when done, secrets reminder).
- [ ] Tests for this phase (below).

#### Acceptance Criteria

- [ ] All four skill copies are byte-identical; `skill-parity.test.ts` (#1196/#1489) green.
- [ ] Skeleton and instance prompt templates are byte-identical.
- [ ] No sentence in the skill or prompt instructs the agent to fetch a `codev/...`
      framework path (`codev/resources/*.md` governance files are user files and may be named).
- [ ] Build and full package test suite pass.

#### Test Plan

- Existing parity tests cover the four copies.
- New assertions in `governance-bootstrap.test.ts` (or a small `bootstrap-docs-prompt.test.ts`):
  the packaged template exists, contains every placeholder exactly once, and the skeleton
  and `codev/templates/` copies match.
- Manual read-through of the rendered prompt against the spec's content contract.

---

### Phase 3: Harness capability for interactive task launch

**Dependencies**: None (independent of 1-2; ordered here so Phase 4 consumes it)

#### Objective

Add the optional harness capability the spec requires so the command does not hardcode
Claude flags, with the fallback decided by capability absence.

#### Files to Create / Modify

- Modify `packages/codev/src/agent-farm/utils/harness.ts`
- Modify the harness unit tests (existing `harness` test file under
  `packages/codev/src/agent-farm/__tests__/`; located during the phase)

#### Deliverables

- [ ] `HarnessProvider.buildInteractiveTaskLaunch?(prompt: string): { args: string[] }`,
      documented like `supportsContextReset`: optional, absence means unsupported, callers
      must fall back.
- [ ] `CLAUDE_HARNESS` and `CODEX_HARNESS` implement it as the positional prompt argument
      (`[prompt]`), verified against each CLI's `--help` (recorded in the doc comment with
      the verification date).
- [ ] OpenCode and custom harnesses do not implement it.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Claude and Codex return `[prompt]`; OpenCode and a custom provider return `undefined`
      for the capability.
- [ ] Existing harness tests stay green; type check passes.

#### Test Plan

Unit tests on the providers and on `resolveHarness` + capability presence for each built-in
and a custom config.

---

### Phase 4: `codev bootstrap-docs` command

**Dependencies**: Phases 1, 2, 3

#### Objective

The user-facing, re-runnable pass, end to end, with all failure paths reported and nothing
destructive.

#### Files to Create / Modify

- Create `packages/codev/src/commands/bootstrap-docs.ts`
- Create `packages/codev/src/lib/change-snapshot.ts` (pre/post snapshot + diff report; kept
  separate because it is reusable and independently testable)
- Modify `packages/codev/src/cli.ts` (register `bootstrap-docs` with `--dry-run`; there is
  deliberately no `-y`, because the pass always confirms before launching an agent)
- Create `packages/codev/src/__tests__/bootstrap-docs.test.ts`
- Create `packages/codev/src/__tests__/change-snapshot.test.ts`

#### Deliverables

- [ ] Flow, in order:
  1. Locate the project root (cwd must contain `codev/`; otherwise error suggesting
     `codev adopt`).
  2. Classify the four files (Phase 1). A **missing** file counts as eligible and is listed
     as "will be created" (adopt/update create them, but a user may have deleted one).
  3. If no file is eligible: print "nothing needs bootstrapping" with per-file status, exit 0,
     launch nothing (no-op re-run, scenario 2).
  4. If the repo is empty (Phase 1 rule): print the explanatory no-op, exit 0 (scenario 5).
  5. `--dry-run`: print eligibility and the resolved launch, exit 0.
  6. Build the prompt: render the Phase 2 template with the packaged skill text, eligible
     and curated lists, project name and git digest (window defined in the Executive Summary).
  7. Resolve the agent command and harness from config (`shell.architect` /
     `shell.architectHarness`, via `loadConfig` + `resolveHarness`). If the harness lacks
     `buildInteractiveTaskLaunch`, or the command's executable is not on `PATH`: write the
     prompt to `.consult/bootstrap-docs/prompt.md`, print manual instructions, exit 0
     without launching (scenario 15). A retired-harness error is reported the same way.
  8. Pre-launch statement + confirm (default **No**): the exact command that will run,
     that it reads the codebase and git log, the writable files, that it consumes model quota,
     and the permission mode inherited from config. Non-TTY stdin ⇒ treat as declined, print
     the command to run interactively.
  9. Snapshot (change-snapshot), then spawn the agent with `stdio: 'inherit'` and **await**
     its exit (a Promise around `spawn`'s `exit`/`error`).
  10. Post-run: change report (below), validation of each eligible file (Phase 1),
      unwritten-eligible detection (file still classifies as placeholder/missing).
  11. Consult (when at least one eligible file was written): run
      `consult -m <gemini|codex|claude> --prompt-file <review prompt> --output
      .consult/bootstrap-docs/<model>.md` for the three models in parallel, wait for all;
      name each failed/skipped reviewer; if `consult` cannot be spawned at all, warn and
      continue. The review prompt asks for system-shape accuracy, invented lessons,
      enumerations/aspirational content, and **sensitive material**. Feedback is never
      applied automatically.
  12. Summary: files written, per-file validation result, out-of-scope changes, consult
      pointer, and an explicit "review before commit — nothing has been staged or committed"
      message.
- [ ] Exit code: non-zero when the change report names any out-of-scope change, a curated
      governance file changed, HEAD/index changed, or validation failed / an eligible file
      was left unwritten. Drafts are always kept; nothing is reverted.
- [ ] `change-snapshot`:
  - git work tree: record HEAD (`git rev-parse HEAD`, tolerating no commits), an index
    fingerprint (hash of `git ls-files --stage`), and for every path reported by
    `git status --porcelain=v1 -z --untracked-files=all` its status plus content hash; also
    content hashes of the four governance files. After: the same; any path whose
    (status, hash) changed or appeared/disappeared is out-of-scope unless it is an eligible
    file or under `.consult/bootstrap-docs/`.
  - non-git directory: snapshot only the four governance files and print that change
    detection is limited to them.
  - Documented limitation: changes to gitignored paths are not detected (stated in the
    summary when in a git repo).
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Re-run on a populated result: no agent spawned, files byte-identical, exit 0
      (scenario 2).
- [ ] Empty repo and no-eligible-file paths launch nothing.
- [ ] Unsupported harness: prompt file written, nothing launched (scenario 15).
- [ ] A stub agent that writes valid drafts ⇒ exit 0, summary lists the files, nothing
      staged (`git diff --cached` empty) (scenario 1, minus real model).
- [ ] A stub agent that edits a curated file / a source file / makes a commit ⇒ each named,
      exit non-zero, nothing reverted (scenario 13).
- [ ] A stub agent that writes nothing or only some files ⇒ unwritten files reported, written
      drafts kept, exit non-zero (scenario 14).
- [ ] Mixed state (curated `arch.md` with > 12 sections, three placeholders): `arch.md`
      byte-identical; map entries checked against real sections; unmapped listed as info
      (scenario 3).
- [ ] Consult: one reviewer failing and `consult` missing both complete with the right
      message (scenario 16).
- [ ] Build, type check and full package suite pass.

#### Test Plan

Integration-style tests in temp git repos. The agent is a stub: tests point
`shell.architect` at a small executable script (written into the temp dir) that performs the
scenario's writes, with `shell.architectHarness` set to a test-registered capability via a
dependency-injection seam on the command (`runBootstrapDocs(opts, deps)` with injectable
`confirm`, `spawnAgent`, `runConsult`, `stdinIsTTY`), so no real model is invoked and no
prompt waits on input. `consult` is stubbed through the same seam. `change-snapshot` gets
its own unit tests (pre-existing dirt left alone ⇒ clean; new untracked file ⇒ reported;
modified tracked file ⇒ reported; commit ⇒ HEAD change; `git add` ⇒ index change).

---

### Phase 5: adopt and update integration plus docs

**Dependencies**: Phase 4

#### Objective

Put the pass where adopters meet it, without two agent sessions sharing the terminal, and
document it.

#### Files to Create / Modify

- Modify `packages/codev/src/commands/adopt.ts`
- Modify `packages/codev/src/commands/update.ts`
- Modify `packages/codev/src/__tests__/adopt.test.ts` (and the update tests file)
- Modify `codev/resources/commands/codev.md` (command reference; `codev/resources/commands/`
  has no skeleton twin, verified during the phase) and the skeleton's adopt-facing docs if
  they describe post-adopt steps (grep both trees for "codev adopt")
- Modify `README.md` / `INSTALL.md` adopt section only if they describe the post-adopt
  governance step (grep first)

#### Deliverables

- [ ] `adopt`: the conflict-merge `claude` spawn becomes awaited (Promise on `exit`/`error`;
      error path unchanged: print manual merge instructions). Only after it resolves:
      - `-y`: never launch; if the repo is non-empty and files are eligible, print
        "run `codev bootstrap-docs` to draft the governance docs from this codebase".
      - interactive, non-empty repo, eligible files: ask "Draft the governance docs from this
        codebase now?" (default No); yes ⇒ call the Phase 4 entry point (which still shows its
        own pre-launch statement and confirm); no ⇒ print the command.
      - empty repo: no offer, no hint (placeholders stay; scenario 5).
- [ ] `update`: after the hot/cold backfill, if any governance file classifies as
      placeholder and the repo is non-empty, print one hint line pointing at
      `codev bootstrap-docs`. Not shown in `--agent` JSON mode's stdout (added as an
      `instructions.bootstrapDocs` string instead) and not shown on `--dry-run`.
- [ ] Docs: `codev bootstrap-docs` entry in the command reference (purpose, flow, what it
      writes, exit codes, `--dry-run`, manual fallback); adopt's "Next steps" mentions it.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] `adopt -y` never launches the bootstrap agent and prints the command when eligible
      (scenario 7).
- [ ] With a CLAUDE.md conflict, the bootstrap offer is reached only after the merge child
      has exited (scenario 8), asserted by ordering of injected stubs.
- [ ] Empty repo: no offer, no hint.
- [ ] `update` prints the hint exactly once when placeholders remain on a non-empty repo and
      not at all after a populated result (scenario 4).
- [ ] Build, type check and full package suite pass; parity tests green.

#### Test Plan

Extend `adopt.test.ts` with stubbed `confirm`/spawn seams (adopt gains the same small
injectable-deps parameter, defaulting to the real implementations) for ordering and `-y`
behaviour; extend update tests for the hint. Manual: run `codev adopt` on a scratch copy of
a small real repository to check the end-to-end terminal experience.

---

### Review-phase gate item (not an implementation phase)

Real-repo verification (spec scenario 18) is owned by the builder in the review phase and
recorded in the review document: run `codev bootstrap-docs` on a real pre-existing repository
other than this one, confirm project-specific hot tier with no slots, cold archives matching
the real system shape, cap respected, and a re-run that changes nothing.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Awaiting adopt's merge session changes adopt's behaviour for existing users | Medium | Medium | Only the timing changes (adopt now returns after the session); error path kept; covered by ordering test |
| Long inlined prompt (skill + digest) exceeds argv limits | Low | Medium | Digest is bounded (≤ 450 subject lines); total well under macOS/Linux `ARG_MAX`; if the rendered prompt exceeds a conservative 100 KB, fall back to the prompt file + instructions |
| Classifier false "placeholder" on a lightly curated file | Low | High | Subset-AND-marker predicate, doubt ⇒ curated; tests for half-edited starters; output is uncommitted |
| Change detector false positives from tools the agent runs (e.g. lockfile churn) | Medium | Low | Reported, not reverted; the human decides; message explains the detector's scope |
| Map-entry matching too strict for natural phrasing | Medium | Low | Rule is "starts with the section name"; our own curated file is the regression fixture |
| Consult cost/latency on every run | Low | Low | Runs only when something was written; parallel; failures non-blocking |
| Codex positional-prompt behaviour changes upstream | Low | Low | Capability is per harness; doc comment records the verification date; fallback exists |

## Documentation Updates

- `update-arch-docs` skill (four copies): bootstrap mode + sensitive-material rejection.
- `codev/resources/commands/codev.md`: new `bootstrap-docs` command; adopt's next steps.
- `codev/resources/arch.md` / `lessons-learned.md` (and hot tier only if a fact earns a slot):
  routed in the review phase per the two-tier rules.
