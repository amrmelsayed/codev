# Specification: Bootstrap the governance docs from an existing codebase

## Problem Statement

`codev adopt` on a codebase with real history leaves all four governance docs as placeholders:

- the COLD archives `codev/resources/arch.md` and `lessons-learned.md` hold only the starter line
  (`_No architecture documented yet._` / `_No lessons captured yet._`);
- the HOT tier `arch-critical.md` / `lessons-critical.md` holds angle-bracket template slots
  (`- <A system-shape fact …>`), plus three seeded universal lessons in `lessons-critical.md`.

The hot tier is injected into every porch phase prompt and, via the `@import` managed block,
into every interactive CLAUDE.md/AGENTS.md session (Spec 987). On an adopted project it
therefore injects template slots, not project knowledge, until a human hand-authors four
files. Nothing in Codev covers that first population: MAINTAIN and the `update-arch-docs`
skill both assume the docs already exist and only audit or diff them.

Who is affected: every team adopting Codev on a mature codebase. The first thing they hit
after `codev adopt` is an undocumented manual authoring pass, and until they do it the
always-on context is noise. An upcoming Jira-tracked onboarding will hit this immediately.

The "architecture emerges from review phases" assumption is correct for `codev init`
(greenfield) and wrong for `codev adopt` on a running system, where the architecture and the
scar tissue already exist in the code and the git log.

## Current State

- `adopt` (and `update` as a backfill) calls `copyHotTierDefaults` and `copyColdTierDefaults`,
  both skip-existing. They copy `templates/arch-critical.md`, `templates/lessons-critical.md`,
  `templates/arch.starter.md` → `arch.md`, `templates/lessons-learned.starter.md` →
  `lessons-learned.md`. No content is derived from the project.
- The cold files are registered as protected user data (never overwritten by `update`).
- The starters carry recognisable markers: a `<!-- STARTER: … -->` comment and the
  `_No … yet._` line (cold); `STARTER:` in the header comment and `- <…>` slot lines (hot).
  No code currently recognises "this file is still a starter".
- `adopt` already launches an interactive `claude` session with a prompt to merge
  `CLAUDE.md`/`AGENTS.md` `.codev-new` conflicts; `codev import` does the same for protocol
  imports. These are the existing precedents for "the CLI hands a task to an agent".
- The `update-arch-docs` skill (four shipped copies: `{.claude,.codex}/skills` ×
  `{repo root, codev-skeleton}`) encodes the routing rules (arch vs lessons, hot vs cold), the
  hot cap (≈10 entries + ≈12-topic map, ≤35 lines), displacement, and the bright-line
  rejections (no file lists, no changelog, no aspirational state). It has diff-mode and
  audit-mode only; neither covers generating docs from a codebase.
- `consult` supports a general mode (`--prompt` / `--prompt-file`) across the three
  reviewers, with Gemini skipping non-blockingly when unavailable.

Workaround today: the adopter writes the four files by hand, or asks an agent ad hoc with no
shared rules, which tends to produce file enumerations and aspirational content that the
skill would reject.

## Desired State

Adopting Codev on an existing codebase produces a **reviewed first draft** of the four
governance files, derived from the codebase and its git history, left **uncommitted** for the
human to review and commit.

- A single, re-runnable **bootstrap pass** exists. It runs an agent with the
  `update-arch-docs` rules over the code shape, build wiring, entry points, persistence,
  process boundaries and git log, and:
  1. writes cold `arch.md` (current system shape) and cold `lessons-learned.md` (lessons from
     the repo's scar tissue: incident fixes in the log, "never do X" comments, recurring bug
     classes; thin is acceptable, invented is not);
  2. routes the load-bearing facts and lessons into the hot files within the cap, and builds
     each hot file's "consult when…" map from the cold doc's actual top-level sections;
  3. leaves the result uncommitted with a clear "review before commit" message;
  4. runs a 3-way consult on the draft when consultation is available, and surfaces the
     feedback to the human without auto-applying it.
- The pass touches **only files that are still placeholders**. A file with curated content
  is never overwritten; it is read as input instead (e.g. a curated `arch.md` feeds the map
  of a still-placeholder `arch-critical.md`).
- `codev adopt` offers the pass at the end on a non-empty repository. On an empty repository
  the placeholders remain and no pass is offered.
- A project that adopted earlier and still has placeholders can run the pass later.
- Re-running on an already-populated result is a no-op: nothing qualifies, nothing changes.
- After the agent finishes, the CLI deterministically checks the result (no template slots
  left, hot caps respected, map entries name real cold sections) and reports any violation
  instead of silently accepting it.

## Success Criteria

- [ ] On a non-empty pre-existing repository (not this one), the pass produces all four files
      with project-specific content and **no** remaining template slots or `STARTER` markers.
- [ ] Each hot file respects the cap: ≤10 facts/lessons, ≤12 map topics, ≤35 lines.
- [ ] Every hot map entry names a real top-level (`## `) section of its cold doc, and every
      top-level cold section appears in the map (up to the 12-topic cap).
- [ ] The cold `arch.md` describes the actual system shape (verified by the human against the
      repo); it contains no per-file enumeration, per-spec changelog, or aspirational content.
- [ ] A file carrying curated (non-placeholder) content is byte-identical before and after
      the pass, on every run.
- [ ] Re-running the pass on the populated result changes no file and reports that nothing
      needs bootstrapping.
- [ ] Nothing is committed, staged, or pushed by the pass; the CLI ends with an explicit
      "review before commit" message listing the files written.
- [ ] When consultation is available, a 3-way consult runs on the draft and its feedback is
      shown to the human (or saved where the message says); when a reviewer is unavailable
      the pass still completes and says which reviewer was skipped.
- [ ] `codev adopt` on an empty repository (no commits, or no files outside Codev scaffolding)
      leaves the placeholders and does not offer the pass.
- [ ] `codev adopt -y` never launches an agent session unprompted; it prints how to run the
      pass instead.
- [ ] The post-run check flags (non-zero exit or a clear warning) a draft that leaves slots,
      exceeds a cap, or has a map entry with no matching cold section.
- [ ] The framework change lands in both trees (`codev/` and `codev-skeleton/`), and any skill
      change lands in all four shipped skill copies, with the existing parity tests green.
- [ ] Unit tests cover placeholder detection, eligibility (empty vs non-empty repo, per-file
      curated vs placeholder), the post-run validator, and the no-op re-run.

## Constraints

- **Skip-existing stays the rule for curated content.** The pass may only replace a file it
  classifies as an untouched starter. Classification must be conservative: any doubt means
  "curated", never "overwrite".
- **Two-tree rule.** Framework changes go in both `codev/` and `codev-skeleton/`; skills land in
  all four shipped copies (`.claude/skills`, `.codex/skills`, and both under
  `codev-skeleton/`), kept identical (parity tests enforce this).
- **Runtime resolution.** Framework content (prompts, skill text) is delivered through the
  resolver/package, not by instructing an agent to fetch a `codev/...` path.
- **Harness neutrality.** Agent-specific launch behaviour should go through the configured
  harness / shell command rather than hardcoding Claude flags in new code, consistent with the
  `HarnessProvider` abstraction. (The existing adopt merge path hardcodes `claude`; the plan
  decides whether the new path follows the harness or the precedent, see Open Questions.)
- **No destructive operations.** The pass never commits, stages, deletes, or rewrites history.
- **The `update-arch-docs` rules are the content contract.** Shape not file lists, current
  state not history, no aspirational content, hot cap with displacement, top-level-only maps.
- **Cost and consent.** Launching an agent consumes the user's model quota; it must be
  explicitly opted into, never triggered by a non-interactive flag.
- No Baked Decisions section exists in the issue; the issue's fix shape is a hypothesis.

## Assumptions

- The adopter has at least one supported agent CLI installed (`codev doctor` already checks
  this). If none is available the pass fails clearly and the placeholders stay.
- The repository has a git history; when it does not (or it is shallow), the pass works from
  the code alone and `lessons-learned.md` may stay thin, which is acceptable.
- The current starter templates are the definition of "placeholder". Older Codev versions'
  starters (if any differed) are recognised by their markers, not exact bytes.
- The CLAUDE.md/AGENTS.md managed block uses `@import` lines, so populated hot files reach
  interactive sessions without regenerating the block. Porch injection reads the files live.

## Solution Approaches

### Approach 1: Opt-in step baked into `codev adopt` only

At the end of `adopt`, ask "Draft the governance docs from this codebase now?" and launch the
agent.

- Pros: zero discovery cost; hits adopters at exactly the right moment.
- Cons: not re-runnable on a project that adopted earlier or declined; `adopt` refuses to run
  when `codev/` exists, so a second attempt has no entry point. Fails the issue's
  re-runnability requirement on its own.
- Risk: low complexity, but incomplete.

### Approach 2: Dedicated `codev` subcommand, offered by `adopt` (recommended)

A new subcommand (working name `codev bootstrap-docs`) that:
detects which of the four files are still placeholders → exits as a no-op if none are, or if
the repo is empty → launches an agent session with a bootstrap prompt grounded in the
`update-arch-docs` rules → on exit, runs the deterministic validator over the result → runs
the 3-way consult on the draft when available → prints the "review before commit" summary.
`adopt` ends by offering it (interactive only; `-y` prints the command). `update` may print a
one-line hint when it sees placeholders on a non-empty repo.

- Pros: re-runnable anywhere, idempotent by construction (per-file placeholder gating),
  testable CLI surface, matches existing "CLI hands a task to an agent" precedents
  (`adopt` merge, `codev import`), and keeps the deterministic parts (eligibility, validation,
  consult orchestration) out of the agent.
- Cons: one new command to document; still depends on an agent session for the drafting.
- Risk: moderate. The interesting work is the prompt quality and the validator.

### Approach 3: A MAINTAIN entry point (porch-driven bootstrap mode)

Add a bootstrap variant of MAINTAIN, run through `afx spawn --protocol maintain`.

- Pros: reuses porch's consultation and PR machinery; output lands as a reviewable PR.
- Cons: requires Tower, a builder worktree and the full afx stack on a project that was
  adopted minutes ago; much heavier than the problem. MAINTAIN's semantics (audit since a base
  commit) don't fit a first population. Not usable from the adopt flow.
- Risk: high ceremony, poor fit for onboarding.

### Approach 4: Skill-only (add a bootstrap mode to `update-arch-docs`, no CLI change)

Document a "bootstrap-mode" in the skill and tell adopters to ask their agent to use it.

- Pros: smallest change; works in any agent session.
- Cons: still an undocumented manual step from the adopter's view; no placeholder gating,
  no validator, no consult, no adopt integration. Leaves the core problem in place.
- Risk: low, but does not meet the success criteria.

**Recommendation: Approach 2, with Approach 4 as its content half.** The rules for *what* a
bootstrapped doc contains belong in the `update-arch-docs` skill (a new bootstrap mode, so the
single skill stays the one owner of the content contract, and an agent invoked any other way
gets the same rules). The CLI subcommand owns everything deterministic: eligibility, launch,
validation, consult, messaging. `adopt` offers it. This satisfies re-runnability,
idempotence, never-overwrite, and the adopt-time experience together.

## Open Questions

**Critical** (none block drafting the plan; flagged for the spec gate):

- None. The issue leaves placement to the builder; this spec recommends Approach 2.

**Important** (shape the design; resolve at the plan gate):

1. **Interactive vs headless agent run.** Interactive (stdio inherited, like the adopt merge)
   lets the human watch and steer, and is harness-neutral (prompt as an argument). Headless
   gives a cleaner hand-back to the validator/consult but needs harness-specific
   non-interactive and tool-permission flags. Recommendation: interactive, with the CLI
   waiting for the session to exit before validating.
2. **Harness vs hardcoded `claude`.** Launch through the project's configured agent command
   (from `.codev/config.json`, via the harness abstraction) or follow the existing adopt
   precedent of spawning `claude` directly. Recommendation: configured harness, falling back
   to `claude` when no config exists yet.
3. **Where consult feedback goes.** Print to the terminal, or write to an uncommitted,
   gitignored file the summary points at. Recommendation: a gitignored file plus a one-line
   pointer, so long reviews are not lost in scrollback.
4. **Placeholder classifier.** Marker-based (`STARTER` comment, `_No … yet._`, `- <…>` slot
   lines) vs exact-byte match against the shipped starter. Recommendation: marker-based with
   a conservative rule (a file counts as placeholder only if it still carries the starter
   markers and no other substantive content), so a half-edited file is treated as curated.
5. **Seeded universal lessons.** `lessons-critical.md` ships three universal lessons. Keep
   them as candidates the bootstrap may retain or displace under the cap, rather than
   treating them as fixed.

**Nice-to-know:**

6. Command name (`codev bootstrap-docs` vs a `codev docs` group). Recommendation: a flat
   subcommand, consistent with the existing flat `codev` command set.
7. Whether `codev update` should print the bootstrap hint on placeholder detection.
   Recommendation: yes, one line, non-blocking.
8. A `--dry-run` that reports eligibility (which files would be bootstrapped) without
   launching an agent. Recommendation: yes, cheap and useful for tests.

## Test Scenarios

Functional:

1. **Happy path, fresh adopt.** Adopt on a non-empty repo with history, accept the offer;
   all four files are rewritten with project content, the validator passes, consult runs,
   nothing is committed, the summary lists the four files.
2. **Re-run is a no-op.** Run the pass again on the result; no file changes, the command
   reports that nothing needs bootstrapping and launches no agent.
3. **Mixed state.** `arch.md` curated, the other three placeholders: `arch.md` is unchanged
   byte-for-byte; `arch-critical.md`'s map reflects `arch.md`'s real top-level sections.
4. **Late adopter.** A project adopted earlier, placeholders still in place; the subcommand
   bootstraps them.
5. **Empty repo.** `adopt` on an empty repo leaves placeholders and does not offer the pass;
   the subcommand exits with an explanatory no-op.
6. **Non-interactive adopt.** `adopt -y` does not launch an agent and prints the command.
7. **Half-edited starter.** A starter with some real lines added is classified curated and
   left untouched.

Validator and error conditions:

8. A draft with a leftover `- <…>` slot line, an 11th hot fact, a 36-line hot file, or a map
   entry naming a non-existent cold section is each reported by the validator.
9. No agent CLI available: the pass fails with a clear message; placeholders untouched.
10. Agent session exits without writing (user aborts): files that were not written stay
    placeholders; the validator reports the incomplete state rather than claiming success.
11. A consult reviewer unavailable: the pass completes and names the skipped reviewer.

Non-functional:

12. Parity tests for the four skill copies stay green; both trees carry the change.
13. Real-repo verification (the issue's Verification section): run on a real pre-existing
    repository other than this one and confirm the hot tier is project-specific with no
    slots, the cold archives describe the real system shape, the cap holds, and a re-run
    changes nothing.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Classifier mistakes curated content for a placeholder and the pass overwrites it | Low | High | Conservative marker-based rule (doubt ⇒ curated); per-file gating; unit tests including half-edited starters; output is uncommitted so git shows the diff |
| Agent produces file enumerations, changelog framing, or invented lessons | Medium | Medium | Bootstrap mode in the skill states the rejections explicitly; deterministic validator for the mechanical rules; 3-way consult; human review before commit |
| Hot tier overflows the cap | Medium | Medium | Cap stated in the prompt and enforced by the validator |
| Hardcoding `claude` breaks adopters on other agents | Medium | Medium | Launch via configured harness with a `claude` fallback (Open Question 2) |
| Model cost surprises the adopter | Low | Low | Explicit opt-in; never under `-y`; prompt states it will run an agent |
| Adopt's existing conflict-merge session and the bootstrap session collide | Medium | Low | Run them sequentially, or offer bootstrap only after the merge session ends; plan decides |
| Thin git history yields an empty lessons file | Medium | Low | Thin is acceptable by design; the validator does not require a minimum lesson count |

## References

- Issue #1797 (this work)
- Spec 987: hot/cold two-tier governance docs, managed block, porch injection
- Issue #1012: cold-tier starter files on init/adopt/update
- `update-arch-docs` skill (content contract, cap, displacement, map accuracy)
- MAINTAIN protocol (documentation sync step)
- `packages/codev/src/commands/adopt.ts`, `packages/codev/src/lib/scaffold.ts`,
  `packages/codev/src/lib/managed-block.ts`
- Spec 591: agent harness abstraction (`HarnessProvider`)
