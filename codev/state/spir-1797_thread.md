# spir-1797 thread — adopt: bootstrap governance docs

## Specify
- No pre-existing spec; drafted from issue + code read (adopt.ts, scaffold.ts, managed-block.ts, update-arch-docs skill, MAINTAIN).
- Recommendation: dedicated `codev` subcommand (working name `bootstrap-docs`) offered at end of `adopt`; content rules as a new bootstrap mode in the `update-arch-docs` skill; CLI owns eligibility (per-file placeholder gating), launch, post-run validator (slots/cap/map), consult, "review before commit".
- Open for plan gate: interactive vs headless run, harness vs hardcoded claude, where consult output goes, classifier rule.
- Spec CMAP iter1: gemini APPROVE; codex + claude REQUEST_CHANGES. Folded in: per-file placeholder predicate (subset-of-starter AND marker present; seeded lessons = starter), non-empty-repo definition, section-scoped cap counting (comment lines excluded), map validity map→cold always / full coverage only when <=12 sections, detect-and-report (pre/post file+git snapshot, non-zero exit, no auto-revert) instead of a guarantee, await adopt's merge session before offering bootstrap, secrets bright-line rule, harness capability + manual-prompt fallback, consult output in .consult/bootstrap-docs/, real-repo verification as a review-phase gate.

## Spec gate
- spec-approval approved 2026-10-12T20:28:58Z (owner word relayed by main). OQ 1-5 stand as resolved in spec.
- Main's addition for the PLAN: the three universal lessons seeded in lessons-critical.md SURVIVE the bootstrap unless a project-specific lesson displaces one under the cap.

## Plan
- Plan drafted: 5 phases (classifier/validator lib → skill bootstrap mode + prompt template → harness `buildInteractiveTaskLaunch` capability → `codev bootstrap-docs` command → adopt/update integration + docs). Real-repo verification stays a review-phase gate item.
- Decisions: git-log digest computed by the CLI (last 300 subjects + ≤150 fix/revert/incident subjects), inlined into the prompt. `claude` and `codex` both verified (2026-10-13 `--help`) to accept a positional prompt for interactive sessions; OpenCode/custom → prompt-file fallback at `.consult/bootstrap-docs/prompt.md`. Seeded universal lessons survive unless displaced under the cap (demoted to cold, never dropped). Only earlier starter variant is the pre-#1012 cold text.
- Plan CMAP: iter1 G APPROVE / X,C REQUEST_CHANGES; iter2 G APPROVE / X,C RC; iter3 G,C APPROVE / X RC. All points folded except one (below). Final plan: 6 phases (consult split out as phase 5). Key iter fixes: missing files ineligible; verbatim single-version classifier; map rule promoted from hot-tier.test.ts helpers (+unique match); tree-tripwire core promoted to lib/tree-snapshot.ts + index hash; harness launch only on positive Claude/Codex identification, headless flags/subcommands unsupported; .claude/settings.local.json exit-bearing (annotated).
- OPEN for plan gate: Codex wants gitignored paths in the change detector; plan keeps the spec's "four files + git state" reading (ignored paths excluded, stated in the summary).
- plan-approval gate pending (2026-10-13).
- 2026-10-12 main ruling: change detector stays git-scoped (gitignored paths not watched; scope statement in every summary). Holding at plan-approval for the owner word.
