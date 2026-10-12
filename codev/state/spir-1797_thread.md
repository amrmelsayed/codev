# spir-1797 thread — adopt: bootstrap governance docs

## Specify
- No pre-existing spec; drafted from issue + code read (adopt.ts, scaffold.ts, managed-block.ts, update-arch-docs skill, MAINTAIN).
- Recommendation: dedicated `codev` subcommand (working name `bootstrap-docs`) offered at end of `adopt`; content rules as a new bootstrap mode in the `update-arch-docs` skill; CLI owns eligibility (per-file placeholder gating), launch, post-run validator (slots/cap/map), consult, "review before commit".
- Open for plan gate: interactive vs headless run, harness vs hardcoded claude, where consult output goes, classifier rule.
- Spec CMAP iter1: gemini APPROVE; codex + claude REQUEST_CHANGES. Folded in: per-file placeholder predicate (subset-of-starter AND marker present; seeded lessons = starter), non-empty-repo definition, section-scoped cap counting (comment lines excluded), map validity map→cold always / full coverage only when <=12 sections, detect-and-report (pre/post file+git snapshot, non-zero exit, no auto-revert) instead of a guarantee, await adopt's merge session before offering bootstrap, secrets bright-line rule, harness capability + manual-prompt fallback, consult output in .consult/bootstrap-docs/, real-repo verification as a review-phase gate.

## Spec gate
- spec-approval approved 2026-10-12T20:28:58Z (owner word relayed by main). OQ 1-5 stand as resolved in spec.
- Main's addition for the PLAN: the three universal lessons seeded in lessons-critical.md SURVIVE the bootstrap unless a project-specific lesson displaces one under the cap.
