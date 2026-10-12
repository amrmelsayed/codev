# spir-1789 thread

## 2026-10-06 specify
- No spec existed; drafted codev/specs/1789-tower-managed-codev-ide-server.md from the issue + #1668 code (commands/ide.ts, servers/ide-server.ts, lib/ide-record.ts).
- Recommended: discovery in the CLI (user's PATH; Tower daemon PATH may lack npm global bin), version check + sidebar install inside Tower's single spawnIdeServer so start/reconcile/respawn all get --extensions-dir.
- Facts found: apps/vscode `package` script does not produce a vsix (`vsix` script does, via a globally-installed vsce, not a declared dep).
- Critical open question for architect: what `codev-ide-server --version` reports (VS Code base vs npm pkg version) and the initial floor.

## 2026-10-06 specify iter1 CMAP (gemini APPROVE, codex REQUEST_CHANGES, claude COMMENT)
- Verified against a local codev-ide server build (scratch clone, 1.135.0): --version = VS Code base version;
  --install-extension into external --extensions-dir works (~2.2s cold, 0.2s same-version); downgrade NEEDS --force;
  other extensions survive. SURPRISE: if the server tree bundles extensions/codev-vscode as a built-in, install is
  refused ("built-in ... not allowed to be updated"). The pre-npm local build does bundle it -> requirement on IDE repo.
- Resolved in spec: floor = Tower constant test-tied to sidebar engines.vscode min (1.128.0); install failure refuses spawn;
  missing vsix warns; live server never killed (hint restart); afx ide install in scope; transactional preflight;
  serialized spawns; optional record fields; 0700/non-symlink ext dir; Tower adds dirname(process.execPath) to spawn PATH.

## 2026-10-06 spec questions answered by IDE side (via main)
- Floor 1.128.0 accepted; published server excludes built-in codev-vscode (pr43 is the counter-example); first published server reports 1.138.0; parse --version line 1 only, ignore npm package suffix (e.g. 1.138.0-codev.1). Folded into spec.

## 2026-10-13 plan drafted
- Plan written (6 phases: vsix packaging, version handshake, extensions dir/install, transactional preflight in spawnIdeServer, CLI discovery/install/status, docs + E2E).
- Decisions in plan: embedded `ide-extension/{codev-vscode.vsix,manifest.json}`; vsce as apps/vscode devDep run via `pnpm --filter codev-vscode exec`; one promise-chain lock in ide-server.ts; E2E Tower restart needs human OK (isolated Tower offered as fallback).

## 2026-10-13 plan-approval gate reached
- Plan CMAP iter1: gemini APPROVE, codex/claude REQUEST_CHANGES (lock re-entrancy deadlock, CLI 30 s timeout vs preflight budget, build blast radius, skill parity wording). All folded in.
- Iter2: gemini APPROVE, codex COMMENT, claude APPROVE; small refinements folded in (budget formula, import-safe manifest helper, below-floor + live server fails transactionally).
- Waiting on human plan-approval.
- Architect main ruling (2026-10-12): phase 6 E2E uses an isolated Tower (non-default port, separate AGENT_FARM_DIR). Do NOT restart the real Tower; if isolation is insufficient, report why and main asks the owner.

## 2026-10-13 implement phase_1 (embedded sidebar vsix)
- `@vscode/vsce` pinned `^3.9.2` in apps/vscode devDeps (4.x requires Node >= 22; CI runs Node 20). Release-time global vsce is also 3.9.2.
- New `packages/codev/scripts/build-ide-extension.mjs` (runs from `bundle-assets`) + pure `ide-extension-manifest.mjs`; `files` gains `ide-extension`; gitignored.
- Owner ruling (2026-10-13): DROP the planned `CODEV_SKIP_IDE_EXTENSION` CI skip flag. Measured cost of the vsix step is ~5.4 s warm, not worth a second build shape. Every `pnpm build` now produces the vsix; no workflow changes.
- Measured with global vsce off PATH: tarball 3,127,626 -> 3,478,353 bytes (+~343 KB; vsix 342 KB, 25 files). `verify-install.mjs` now asserts the vsix exists and manifest version == package version; passes on packed tarballs.
- Note: post-release-e2e.yml also runs verify-install, so a manual dispatch against a pre-1789 published version would now fail the new check (expected; release shape changed).
- SURPRISE: the spec's "codev and codev-vscode are versioned in lockstep" holds only for stable versions. scripts/bump-all.sh skips apps/vscode for pre-releases (Marketplace rejects semver suffixes), so codev 3.4.0-rc.1 embeds the last stable sidebar. verify-install and the unit test therefore enforce version equality only for stable versions; pre-releases only need a present, well-formed manifest. Functionally fine: Tower's idempotency keys on the manifest version, not the codev version.
- Owner ruling (2026-10-13), superseding the pre-release note above: no version-equality check between the embedded vsix and the codev package at all. Both come from the same build/commit, so they are compatible by construction; RCs are no longer used. verify-install checks only presence + well-formed manifest. Spec and plan amended (equality and skip flag removed).
- Phase 1 iter2: codex flagged vsce 3.9.2's Azure deps (Node >=22) vs CI Node 20. Verified `vsce package` never loads @azure/identity (publish-only) and the vsix build succeeds under Node 20.20.2.

## 2026-10-13: phase_2 (version handshake)
- New `src/agent-farm/lib/ide-version.ts`: floor `1.128.0`, line-1-only strict parser (prerelease on line 1 = unparseable), comparator, `buildIdeServerEnv` (sanitized env + Node dir on PATH), `checkIdeServerVersion` via execFile, and all IDE subprocess bounds (version 10s, install 60s, ready 15s, stop-exit 5s) plus derived `IDE_START_BUDGET_MS`. ide-server.ts now imports ready/stop bounds from it.
- Floor-tie test reads embedded manifest when built, else apps/vscode/package.json, and asserts which source it read.
- Spawn env wiring into ide-server.ts left for phase 3 (plan lists only ide-version.ts for this phase).
- Porch `tests` check failed intermittently twice (porch prints only stderr, so the test was unnamed). Bounded repro loop per main caught it on run 4 of 6: `src/terminal/__tests__/session-manager.test.ts > SessionManager > auto-restart logic > applies crashLoopFallback after repeated fast failures` (10.4s; `expect(fs.existsSync(sentinel)).toBe(true)` at :1430 got false). Already `skipIf(CI)`; unrelated to this lane (no terminal files touched). Reported to main for filing; goes under Flaky Tests in the review.
- phase_2 iter2 CMAP: gemini/codex/claude all APPROVE. Claude's non-blocking notes carried into phase 3: extract the bounded-run (timer + SIGKILL + pipe destroy) into a shared helper for the 60s install call; consider killing the process group so grandchildren are not orphaned; cap the quoted unparseable line 1; reject with an Error-shaped value.
