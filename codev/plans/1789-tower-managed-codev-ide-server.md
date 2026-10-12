# Plan: Tower-managed Codev IDE server from npm

**Specification**: [codev/specs/1789-tower-managed-codev-ide-server.md](../specs/1789-tower-managed-codev-ide-server.md)

## Executive Summary

The spec's Approach 1 is implemented: **discovery runs in the CLI** (the user's `PATH`), and **everything that must hold for every spawn runs in Tower's single spawn function** (version check, sidebar install, `--extensions-dir`, spawn environment). The `/api/ide` request contract stays backward compatible; new runtime facts extend `~/.agent-farm/ide-server.json` as optional fields.

The work is ordered bottom-up so each phase is testable on its own:

1. Packaging puts the sidebar vsix (plus a small manifest naming its id, version and engine range) inside `@cluesmith/codev`.
2. A pure Tower-side version module (floor constant, `--version` parsing, the spawn environment).
3. A Tower-side extensions module (Tower-owned directory, idempotent install through the server's own CLI).
4. Wiring both into `spawnIdeServer` as a transactional, serialized preflight on all three spawn paths, with the record and status extended.
5. The CLI side: discovery, `afx ide install`, the restart hint and the richer `afx ide status`.
6. Documentation and the real-user-path end-to-end verification (Test Scenario 21).

Phases 2 and 3 add modules with no callers; phase 4 is the only phase that changes Tower's runtime behaviour, so the #1668 regression suites are the guard there.

### Decisions this plan makes (within the spec's latitude)

- **Embedded location**: `packages/codev/ide-extension/` holding `codev-vscode.vsix` and `manifest.json` (`{ "id": "cluesmith.codev-vscode", "version": "<ver>", "engines": { "vscode": "<range>" } }`). Tower reads the manifest instead of unzipping the vsix, so the idempotency check and the floor test need no zip parsing. The directory is generated (gitignored), like `dashboard-dist/` and `skeleton/`.
- **vsix build**: a new `packages/codev/scripts/build-ide-extension.mjs`, run from `bundle-assets`, invokes `vsce package --no-dependencies --out <abs>` inside `apps/vscode` through `pnpm --filter codev-vscode exec`. `vsce package` runs the extension's `vscode:prepublish` (dependency build plus the production `package` script), which is the same command `apps/vscode/scripts/publish.sh` uses at release. `@vscode/vsce` becomes a devDependency of `apps/vscode`, where it executes.
- **Version source of truth for "installed"**: the extensions directory's `extensions.json` index (verified shape: array of `{ identifier: { id }, version, location }`), read without a subprocess.
- **Serialization**: one module-level promise chain in `ide-server.ts` (`withIdeLock`) that every start, respawn and reconcile goes through. The existing `respawnInFlight` dedup stays, layered on top, so concurrent `/ide/` requests still share one respawn.
- **Subprocess timeouts**: `--version` 10 s, `--install-extension` 60 s (cold install measured at 2.2 s; the bound is for a wedged server, not a slow one). Both use `execFile` (no shell) with the spawn environment from phase 2.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Embedded sidebar vsix in the codev package"},
    {"id": "phase_2", "title": "Server version handshake and spawn environment"},
    {"id": "phase_3", "title": "Tower-owned extensions directory and idempotent sidebar install"},
    {"id": "phase_4", "title": "Transactional, serialized spawn preflight on all spawn paths"},
    {"id": "phase_5", "title": "CLI discovery, afx ide install, and richer status"},
    {"id": "phase_6", "title": "Documentation and end-to-end verification"}
  ]
}
```

## Phase Breakdown

### Phase 1: Embedded sidebar vsix in the codev package

**Dependencies**: None

#### Objective

`pnpm build` in `packages/codev` produces `ide-extension/codev-vscode.vsix` and `ide-extension/manifest.json`, and `pnpm pack` ships them, using a declared `@vscode/vsce` (no global `vsce`).

#### Files to Create / Modify

- `apps/vscode/package.json`: add `@vscode/vsce` to `devDependencies` (the `vsix` script then resolves it locally).
- `pnpm-lock.yaml`: lockfile update from `pnpm install`.
- `packages/codev/scripts/build-ide-extension.mjs` (new): cleans `ide-extension/`, runs `pnpm --filter codev-vscode exec vsce package --no-dependencies --out <abs>/ide-extension/codev-vscode.vsix`, then writes `manifest.json` from `apps/vscode/package.json` (`publisher.name`, `version`, `engines.vscode`). Fails the build loudly if vsce fails or the vsix is missing.
- `packages/codev/package.json`: `bundle-assets` gains `node ./scripts/build-ide-extension.mjs`; `files` gains `ide-extension`.
- `.gitignore`: `packages/codev/ide-extension/`.
- `packages/codev/scripts/verify-install.mjs`: after the global install, assert `<prefix>/lib/node_modules/@cluesmith/codev/ide-extension/codev-vscode.vsix` exists and `manifest.json` parses with `version` equal to the installed package's version. This runs in the existing `Package Install Verification` CI job, so CI covers Test Scenarios 1 and 2 (the runner has no global `vsce`).
- `packages/codev/src/__tests__/ide-extension-packaging.test.ts` (new): unit test of the manifest-writing helper exported from the script (id, version, engine range copied correctly; missing fields throw).

#### Deliverables

- [ ] `@vscode/vsce` declared and locked.
- [ ] Build script producing vsix plus manifest.
- [ ] Package `files` and gitignore updated.
- [ ] Install verification asserts the embedded vsix and its version.
- [ ] Unit test for the manifest helper.

#### Acceptance Criteria

- [ ] `pnpm build` in `packages/codev` succeeds with `vsce` absent from the global `PATH`.
- [ ] `pnpm pack` lists `ide-extension/codev-vscode.vsix` and `ide-extension/manifest.json`; manifest `version` equals the package version.
- [ ] Tarball growth is on the order of the vsix size (hundreds of KB). Recorded in the thread log with before and after sizes.
- [ ] `node scripts/verify-install.mjs` passes against the packed tarballs.

#### Test Plan

- Unit: manifest helper.
- Integration: local `pnpm build && pnpm pack`, `tar tzf` listing, `verify-install.mjs` run, all with `vsce` not on `PATH` (run with a `PATH` that excludes the global npm bin).

### Phase 2: Server version handshake and spawn environment

**Dependencies**: Phase 1 (the floor test reads the embedded manifest's engine range; it falls back to `apps/vscode/package.json` in a source checkout, so phase 2 tests do not require a build)

#### Objective

A self-contained Tower-side module that answers "is this server binary new enough?" and provides the environment every server subprocess (version check, install, spawn) runs with.

#### Files to Create / Modify

- `packages/codev/src/agent-farm/lib/ide-version.ts` (new):
  - `IDE_SERVER_MIN_VERSION = '1.128.0'`.
  - `parseIdeServerVersion(stdout)`: line 1 only, trimmed, strict `major.minor.patch` (a prerelease or build suffix on line 1 is accepted and ignored for comparison); returns null when unparseable.
  - `compareVersions(a, b)`.
  - `buildIdeServerEnv(baseEnv)`: `sanitizeAgentEnv(baseEnv)` with `dirname(process.execPath)` prepended to `PATH` (not duplicated when already present).
  - `checkIdeServerVersion(serverPath, opts)`: `execFile(serverPath, ['--version'], { timeout, env })`; resolves `{ version }` or throws an `IdeServerVersionError` whose message names the installed version (or the failure: non-zero exit, timeout, unparseable output), the floor, and the upgrade command (`npm i -g @cluesmith/codev-ide`).
- `packages/codev/src/agent-farm/__tests__/ide-version.test.ts` (new).

#### Deliverables

- [ ] Version module with floor constant, parser, comparator, env builder and check.
- [ ] Unit tests.

#### Acceptance Criteria

- [ ] Floor-tie test: `IDE_SERVER_MIN_VERSION` is at least the minimum of the sidebar's `engines.vscode` range (`^1.128.0` gives `1.128.0`); bumping the engine above the floor fails the test (Scenario 11).
- [ ] Equal-to-floor and above-floor accepted; below-floor refused with both versions named (Scenarios 7, 8).
- [ ] Non-zero exit, timeout and garbage output each refused with a clear message (Scenario 9).
- [ ] Only line 1 is read: three-line output `1.138.0\n<commit>\narm64` parses as `1.138.0`; a package-style suffix never enters the comparison.
- [ ] `buildIdeServerEnv` puts Node's directory on `PATH`.
- [ ] `pnpm build`, `check-types` and the full vitest suite green.

#### Test Plan

Unit tests with fake server binaries: small executable shell scripts written to a temp dir that print a chosen `--version` output, exit non-zero, or sleep past the timeout. The timeout test uses a short injected timeout.

### Phase 3: Tower-owned extensions directory and idempotent sidebar install

**Dependencies**: Phase 1 (manifest format), Phase 2 (`buildIdeServerEnv`)

#### Objective

A self-contained Tower-side module that guarantees `~/.agent-farm/ide-extensions` holds the embedded sidebar at exactly the embedded version, using the server's own CLI, without touching other extensions.

#### Files to Create / Modify

- `packages/codev/src/agent-farm/lib/ide-extensions.ts` (new):
  - `getIdeExtensionsDir()`: `resolve(AGENT_FARM_DIR, 'ide-extensions')`.
  - `ensureIdeExtensionsDir(dir)`: create with mode 0700 when absent; when present, `lstat` must be a real directory (not a symlink) owned by `process.getuid()`, else throw a clear error naming the path and the problem.
  - `locateEmbeddedSidebar()`: resolves `ide-extension/` relative to the installed package (the same `__dirname`-relative pattern `tower-server.ts` uses for `dashboard-dist`); returns `{ vsixPath, id, version }` or null when the vsix or manifest is missing.
  - `readInstalledExtensionVersion(dir, id)`: reads `extensions.json`; null when absent, unreadable or not listed.
  - `ensureSidebarInstalled(serverPath, opts)`: returns `{ outcome: 'skipped' | 'installed' | 'missing-vsix', version, previousVersion }`. Skip when the indexed version equals the embedded version (no subprocess). Otherwise `execFile(serverPath, ['--install-extension', vsix, '--force', '--extensions-dir', dir], { timeout, env })`; non-zero exit or timeout throws an `IdeSidebarInstallError` carrying the CLI's stderr and naming the likely cause (a server that bundles `codev-vscode` as a built-in). Missing vsix logs a warning and returns `missing-vsix`.
- `packages/codev/src/agent-farm/__tests__/ide-extensions.test.ts` (new). `AGENT_FARM_DIR` is pointed at a temp dir, as the existing `ide-record` tests do.

#### Deliverables

- [ ] Extensions module.
- [ ] Unit tests.

#### Acceptance Criteria

- [ ] Empty directory: install runs with exactly `--install-extension <vsix> --force --extensions-dir <dir>` (Scenario 12).
- [ ] Same version indexed: no subprocess runs (Scenario 13).
- [ ] Older or newer version indexed: install runs with `--force` (Scenario 14).
- [ ] Install exits non-zero or times out: throws with stderr surfaced (Scenario 15).
- [ ] Embedded vsix missing: warning plus `missing-vsix`, no throw (Scenario 16).
- [ ] Directory is a symlink, a file, or owned by another uid: throws (Scenario 17; the other-uid case is tested by stubbing the ownership read, since tests cannot chown).
- [ ] New directory is created 0700.
- [ ] Build, type-check and the full suite green.

#### Test Plan

Unit tests with a fake server script that records its argv to a file and, on install, writes an `extensions.json` entry, so the skip-after-install path is observable. The "unrelated extension survives" half of Scenario 14 depends on the real server CLI and is verified in phase 6 against a real server build (already verified manually while writing the spec).

### Phase 4: Transactional, serialized spawn preflight on all spawn paths

**Dependencies**: Phases 2 and 3

#### Objective

Every spawn path (`afx ide start` via `/api/ide`, boot reconcile, on-demand respawn) runs the version check and the sidebar install **before** stopping or replacing anything. It then spawns with `--extensions-dir` and the phase 2 environment, and records the new facts. Concurrent starts and respawns never interleave.

#### Files to Create / Modify

- `packages/codev/src/agent-farm/lib/ide-record.ts`: `IdeServerRecord` gains optional `serverVersion`, `extensionsDir`, `sidebarVersion`; `readIdeRecord` keeps the existing required-field whitelist and copies the new fields only when they are strings. A legacy record still parses.
- `packages/codev/src/agent-farm/servers/ide-server.ts`:
  - `withIdeLock(fn)`: a module-level promise chain; `spawnIdeServer`'s public path, `stopIdeServer` from the API, and `ensureIdeServerLive`'s respawn all run inside it.
  - `runIdePreflight(serverPath, log)`: `checkIdeServerVersion`, then `ensureIdeExtensionsDir`, then `ensureSidebarInstalled`. Returns `{ serverVersion, extensionsDir, sidebarVersion, sidebarChanged }`. It throws before any side effect on the server or the record.
  - `spawnIdeServer` reordered: validate the path, **preflight**, then the port-change stop, then the live-port adopt, then spawn. The spawn args add `--extensions-dir <dir>`; the env uses `buildIdeServerEnv`; the record carries the three new fields.
  - Live-port adopt: never killed. The returned result gains `restartRequired: boolean`, true when the sidebar changed or the prior record has no `extensionsDir` (a pre-#1789 server). The adopted record keeps the prior record's `extensionsDir` (absent stays absent) so the status stays truthful about what the live process loaded.
  - Respawn failure logs the preflight reason (for example "below floor") and does not spawn (Scenario 10).
- `packages/codev/src/agent-farm/servers/ide-server.ts` `handleIdeApi`: the POST response passes `restartRequired`; GET status passes the record's new fields through unchanged (already the whole record). Request body contract unchanged.
- `packages/codev/src/agent-farm/__tests__/ide-server-preflight.test.ts` (new); `ide-record.test.ts` extended with legacy and new-field cases.

#### Deliverables

- [ ] Record extended (optional fields), legacy-compatible.
- [ ] Preflight in the single spawn function, ahead of stop and replace.
- [ ] `--extensions-dir` and the spawn env on every spawn.
- [ ] Serialization lock.
- [ ] Live-server `restartRequired` signal.
- [ ] Tests.

#### Acceptance Criteria

- [ ] Spawn argv includes `--extensions-dir <dir>` for the API start, boot reconcile and on-demand respawn (Scenario 18).
- [ ] Below-floor or failed-install preflight on a port change leaves the existing live server running and `ide-server.json` byte-identical (Scenario 19).
- [ ] Below-floor or failed install: nothing spawned, no record written (Scenario 8).
- [ ] Respawn of a server downgraded below the floor is refused and logged (Scenario 10).
- [ ] Two overlapping starts, and a start plus a respawn, produce one spawn and non-interleaved record writes (Scenario 20).
- [ ] A legacy record parses, and its live server is adopted on boot (Scenario 23).
- [ ] Live server plus a changed sidebar, or a legacy record, gives `restartRequired: true`; the live server is not killed.
- [ ] The #1668 suites (`ide-record`, `ide-forward`, `ide-forward-integration`, `ide-forward-auth`, routes and websocket auth) stay green (Scenario 25).
- [ ] Build, type-check and the full suite green.

#### Test Plan

Unit tests mocking `getProcessesOnPort` and `child_process.spawn`, and injecting the phase 2 and 3 functions (fake server scripts for `--version` and install), assert ordering (preflight strictly before `stopIdeServer`), argv, record contents and lock behaviour. Concurrency is tested by firing two starts against a deferred fake spawn and asserting one spawn call.

### Phase 5: CLI discovery, afx ide install, and richer status

**Dependencies**: Phase 4 (the `restartRequired` field and the new record fields in status)

#### Objective

`afx ide start` with no flags finds the server in the user's shell environment; `afx ide install` installs it; `afx ide status` shows the pairing.

#### Files to Create / Modify

- `packages/codev/src/agent-farm/commands/ide.ts`:
  - `resolveIdeServerPath({ serverPath, env })`, in order:
    1. `--server-path`, resolved, with the existing "not found" error.
    2. `codev-ide-server` on the user's `PATH`, by scanning `PATH` entries for an executable file (no `which` subprocess).
    3. Global `node_modules` fallback: first `@cluesmith/codev-ide` as a sibling of the running codev install, then `npm root -g` (`execFile`, bounded timeout). The bin path comes from that package's `package.json` `bin["codev-ide-server"]`.

    It returns an absolute path, unrealpath'd, so in-place upgrades take effect on respawn. It returns null when nothing is found.
  - `ideStart`: uses discovery. When nothing is found it exits 1 before any Tower request, with a message naming `afx ide install`, `npm i -g @cluesmith/codev-ide`, and `--server-path`. On success it prints the server version and sidebar version, plus the restart hint (`afx ide stop && afx ide start`) when `restartRequired` is set.
  - `ideInstall`: `spawn('npm', ['i', '-g', '@cluesmith/codev-ide'], { stdio: 'inherit' })` in the user's environment (never through Tower). It exits with npm's status. On success it rediscovers the server and prints its `--version` line 1.
  - `ideStatus`: adds server version, extensions directory and sidebar version; shows "unknown" when the record lacks them. The no-record hint becomes `afx ide start`.
- `packages/codev/src/agent-farm/cli.ts`: `--server-path` becomes an optional `.option` (help text: "overrides discovery"); new `ide install` subcommand.
- `packages/codev/src/agent-farm/__tests__/ide-command.test.ts` (new).

#### Deliverables

- [ ] Discovery with the three-tier order.
- [ ] Not-found error with no Tower request.
- [ ] `afx ide install`.
- [ ] Status fields and the restart hint.
- [ ] Tests.

#### Acceptance Criteria

- [ ] `--server-path` wins without consulting `PATH`; a nonexistent path keeps today's error (Scenario 3).
- [ ] On `PATH` resolves to that path (Scenario 4).
- [ ] Sibling global package resolves through the fallback (Scenario 5).
- [ ] Nothing found: exit 1, hint text present, the Tower request function is never called (Scenario 6).
- [ ] Status with a full record and a legacy record shows the right fields and "unknown" (Scenario 22).
- [ ] `ideInstall` exits with npm's non-zero status, and reports the version on success (Scenario 24, with `npm` stubbed by a fake on `PATH`).
- [ ] Build, type-check and the full suite green.

#### Test Plan

Unit tests with temp directories as fake `PATH` entries and fake global `node_modules` trees, `npm` replaced by a fake script on `PATH`, and the Tower request function stubbed to assert it is or is not called.

### Phase 6: Documentation and end-to-end verification

**Dependencies**: Phases 1 to 5

#### Objective

Document the `afx ide` surface where users and agents look, update the architecture record, and prove the real user path works (Scenario 21) before the PR is called done.

#### Files to Create / Modify

- The four shipped afx skill copies (`.claude/skills/afx/SKILL.md`, `.codex/skills/afx/SKILL.md`, `codev-skeleton/.claude/skills/afx/SKILL.md`, `codev-skeleton/.codex/skills/afx/SKILL.md`): a new `afx ide` section (install, start with discovery, `--server-path`, stop, status, the restart hint), identical across the four. The skill parity tests (#1196, #1489) are run.
- `codev/resources/commands/agent-farm.md`: a new `afx ide` section.
- `codev/resources/arch.md` §"IDE prefix forward (Issue #1668)": the record shape gains the optional fields; the lifecycle gains preflight (version floor, sidebar install, `--extensions-dir`), serialization, and the CLI-side discovery.
- `codev/state/spir-1789_thread.md`: E2E evidence.
- `docs/releases/UNRELEASED.md`: a user-facing entry, if the file exists on the branch at that point.

#### Deliverables

- [ ] Docs in four skill copies plus the command reference.
- [ ] arch.md updated.
- [ ] Scenario 21 run and its evidence recorded.

#### Acceptance Criteria

- [ ] Skill parity tests green.
- [ ] Scenario 21 on macOS arm64:
  1. `npm i -g` the packed tarballs into a scratch prefix (or the real global prefix, if the architect agrees), plus `@cluesmith/codev-ide` if it is published by then. Otherwise use a scratch clone of the local server tree with `extensions/codev-vscode` removed, via `--server-path`.
  2. Restart Tower.
  3. Run `afx ide start` with no flags (or with `--server-path` for the fallback).
  4. Playwright opens `http://localhost:4100/ide/?folder=<repo>`.

  Expected: the Codev sidebar renders, and `afx ide status` shows a sidebar version equal to the codev version. A screenshot path is recorded in the thread.
- [ ] Also verified against the real server: an unrelated extension in the directory survives a sidebar reinstall, and a stop/start after a sidebar version change loads the new sidebar.
- [ ] Full suite, build and type-check green.

#### Test Plan

Manual plus Playwright, per the testing guide. Restarting Tower on this machine needs explicit human permission (standing rule), so I will ask the architect before the restart step. The fallback is a scratch Tower on a non-default port with an isolated `AGENT_FARM_DIR`, if that is preferred.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `vsce package` inside the codev build is slow or flaky in CI (it triggers the extension's `vscode:prepublish`: dependency build, type-check, lint, esbuild) | Medium | Medium | Phase 1 measures the added build time and records it. The CI `Package Install Verification` job has a 10-minute bound; if it is exceeded, raise the bound with a measured justification rather than skipping the vsix. |
| `@cluesmith/codev-ide` is not published before phase 6 | Medium | Low | The spec's sanctioned fallback is a scratch server tree with the built-in removed, via `--server-path`; discovery itself is covered by unit tests. |
| Restarting the real Tower for E2E disrupts live sessions | Medium | High | Ask the architect first; offer an isolated Tower (separate port and `AGENT_FARM_DIR`) instead. |
| The lock serializes a slow preflight behind a stop, delaying `/ide/` respawns | Low | Low | Bounded subprocess timeouts; the respawn dedup still collapses concurrent requests into one. |
| `extensions.json` format differs in some server version | Low | Medium | An unreadable index means "not installed", so Tower falls back to running the install (correct, only slower). |
| Reordering `spawnIdeServer` breaks a #1668 behaviour | Medium | High | Run the #1668 suites in phase 4; the ordering test asserts preflight-before-stop explicitly. |
| The four skill copies drift | Low | Medium | Edit all four together; run the parity tests. |

## Documentation Updates

- Four afx skill copies and `codev/resources/commands/agent-farm.md`: new `afx ide` documentation (phase 6).
- `codev/resources/arch.md` §"IDE prefix forward (Issue #1668)": record shape and lifecycle (phase 6).
- The review document routes any new arch or lessons facts by tier at review time; no hot-tier change is planned.
