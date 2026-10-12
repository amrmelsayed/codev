# spir-1797 thread — adopt: bootstrap governance docs

## Specify
- No pre-existing spec; drafted from issue + code read (adopt.ts, scaffold.ts, managed-block.ts, update-arch-docs skill, MAINTAIN).
- Recommendation: dedicated `codev` subcommand (working name `bootstrap-docs`) offered at end of `adopt`; content rules as a new bootstrap mode in the `update-arch-docs` skill; CLI owns eligibility (per-file placeholder gating), launch, post-run validator (slots/cap/map), consult, "review before commit".
- Open for plan gate: interactive vs headless run, harness vs hardcoded claude, where consult output goes, classifier rule.
