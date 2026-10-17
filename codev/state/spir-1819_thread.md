# spir-1819 thread — Tower Decisions tab

## 2026-10-17 · Specify

- Baked decisions live in the architect's triage *comment* on #1819 (not the issue body); copied verbatim into the spec's Constraints. Owner's time-zone rule (comment, 12:11 am) also in Constraints.
- Survey: web dashboard (`apps/web`) does NOT depend on `@cluesmith/codev-artifact-canvas` today (only VS Code does) — reusing `MarkdownView` per baked decision 1 means adding that workspace dep.
- Conditional-tab precedent: Team tab via `teamEnabled` on the workspace state response.
- Change-detection precedent: annotator `open.html` polls `api/mtime` every 1s. Spec recommends polling (Approach 1) over a new fs.watch+SSE watcher.
- Spec takes positions on: explicit Submit button, re-ruling allowed (inserted above earlier ruling), per-item fingerprint refusal (stricter than baked #3), config key `dashboard.decisionsFile`, blank-line separation in the splice. All listed as Important open questions for the spec gate.

## 2026-10-17 · Specify iter 1 review (codex + claude: both REQUEST_CHANGES)

Addressed all points in the spec:
- Path containment now canonical (symlink-resolved) at every read/write; symlinked file keeps its link.
- One explicit structural grammar (CommonMark subset: fences, ATX headings w/ ≤3 spaces); comments with heading/fence/Your-word lines refused; plus a re-parse verification catch-all after every splice.
- Writes serialized per file inside Tower + atomic temp-file rename; success returns the re-parsed doc.
- Already-ruled items now READ-ONLY (reversed my earlier "allow re-ruling above"): keeps the file unambiguous and makes the second of two concurrent submits refuse cleanly.
- Duplicate-id items fully read-only; drafts on items that stop being writable are "held" (copyable + Discard).
- Timestamp zone table enumerated; DST gap/fold → unconverted; Intl offset probing, no date lib.
- Links: Decisions view opens http(s) in new tab, others inert; shared renderer untouched.
- Dropped the blank line between Your-word line and the word (word on the very next line) and the untestable "same bytes as hand-typed" criterion. main's scan contract is now Open Question 1 (Critical, confirm at gate).

## 2026-10-17 · Spec gate wait — Open Question 1 resolved

- Architect relayed the adopter hub's scan contract: everything after the **Your word:** line to end of item is the ruling; same-line text after the options is NOT read; no **Ruling:** line is appended; on a ruling the item leaves ## Open for a one-liner in ## Ruled. Folded into Assumptions; OQ1 marked resolved. Still waiting on the human spec-approval.

## 2026-10-17 · Spec addition — owner questions (Q&A thread)

- Owner's protocol addition (issue comment 6:15 am): owner may type a QUESTION in the comment box (no new write shape); main pastes `- **You asked (t):**` / `- **<Name>'s answer (t):**` pairs above the Your-word line; tab renders them as a thread, newest at bottom.
- Design point (read-only rule vs question round-trip) resolved by the hub: it REMOVES the question text (and any <!-- REVIEW --> comment) from under Your-word when it pastes the pair, so the item is unruled again. Read-only rule unchanged; recorded as an explicit dependency in Assumptions. Current ruling now shown verbatim (plain text) so a REVIEW comment is visible; read-only note made neutral (tab can't tell a ruling from a question).

## 2026-10-17 · Spec approved (human, relayed by architect) → Plan

- Ran `porch approve 1819 spec-approval` on the architect's relay of the human approval.
- Housekeeping: owner's global rules forbid Co-Authored-By / "Generated with" lines — none from here on (earlier spec commits keep theirs; architect said no rewrite).
- Owner ask at plan time: evaluate YAML/JSON/hybrid instead of markdown. Plan carries a "Format Evaluation" section; recommendation: KEEP MARKDOWN (owner hand-typeability, per-item failure vs whole-file failure in YAML/JSON, js-yaml can't round-trip so the byte-preserving splice doesn't get easier, cross-repo hub migration). The one real structured win — unambiguous stamps — is already available: the spec accepts numeric offsets, so the hub can write `12:10 am -07:00` with no tab change.
- Plan: 6 phases — read model (parser+stamp+types) → splice → routes (config, realpath containment, KeyedSerializer + atomic rename) → read-only tab → ruling UI/drafts → Playwright + docs.

## 2026-10-17 · Plan iter 1 review (codex + claude: both REQUEST_CHANGES) — all accepted

- useDecisions: skip-while-in-flight + generation counter (applyDocument bumps it) so a stale poll can't overwrite a write's document.
- E2E: explicit non-4100 TOWER_TEST_PORT required (precedent #1630); throwaway mkdtemp workspaces only — never the repo (codev/state/*.md is gitignored, a leftover would be invisible).
- Option tokenization: ` / ` starts an option only when followed by a backtick.
- Tab is conditional-then-sticky for the page session so "file disappears → not-found, held drafts visible" is reachable.
- decisionsEnabled: configured path memoized ≤5s for the state flag only (state polled every 1s); config errors → flag false, logged, never fail /api/state.
- Theme CSS imported from main.tsx; structure-changed reached via a pathological option word (`##`), no mocks.
- Old Phase 4 split → 7 phases total.

## 2026-10-17 · Phase 1 (read model) — approved by codex + claude at iteration 2

- Parser, grammar and stamp resolver landed with the wire types. Deliberate deviations, reviewed: the fingerprint is SHA-256 of heading → last non-blank line, so re-spacing between items is not an edit; two `## Open` sections → file problem `open-multiple`, every item read-only; an option description is only the text after `=`.

## 2026-10-17 · Phase 2 (splice) — implemented after a context refresh

- `spliceRuling(text, request)` in `servers/decisions/splice.ts`; pure, returns `{ ok, text }` or `{ ok: false, code, message }` and never text on refusal.
- Added refusal code `open-multiple` to `DecisionsRefusalCode`: phase 1 makes every item read-only when the file has two `## Open` sections, and none of the existing codes describes that. Phase 3 should map it to 409 with the other state refusals.
- Verification goes past the spec's comparison list in one way: every inserted line must also re-parse as plain, unfenced content. Without that, an option word like `` `####` `` (a level-4 heading inside the item) or `` `~~~` `` in the file's last item (an unclosed fence with nothing after it) passes the spec's checks. This is the same rule the comment checks apply, extended to the word.
- Comment line breaks: CRLF, CR and LF are all treated as breaks and rewritten in the file's own line ending, so a lone CR can't hide a heading on what other renderers treat as its own line.
- `**Your word:**` in the middle of a comment line is accepted: per the grammar, only a line that *starts* with the label is a Your-word line.
- Added the carried-forward `labelAt === -1` guard in `parseOptions`.

## 2026-10-17 · Phase 3 (routes) — implemented after a context refresh

- `servers/decisions/file.ts`: config key `dashboard.decisionsFile` (default kept as a constant, not in `DEFAULT_CONFIG`, so `getDefaultConfig()` starter configs don't change); canonical containment walks to the nearest existing ancestor, so `../missing/dir/x.md` is refused as outside rather than throwing; atomic write = temp file beside the canonical target (`wx`, target mode, fsync) + rename, temp removed on failure; one `KeyedSerializer` per canonical path.
- `servers/decisions/routes.ts`: GET answers `{ ok: true, document }` (plan said `{ document }`; `ok` added so both routes share one response shape, typed `DecisionsReadResponse`). Status map is exhaustive over `DecisionsRefusalCode`: input 400 (incl. `outside-workspace`), `not-found` 404, state 409 (incl. `open-multiple`), `structure-changed` 422, `config-error` 500.
- New refusal `not-utf8` (422): the route checks the file's bytes round-trip through UTF-8 before splicing; otherwise a stray invalid byte anywhere would be rewritten as U+FFFD, breaking "every pre-existing byte preserved".
- Handlers take Tower's `ctx.log` (plan signatures had none); `handleWorkspaceState` now takes `ctx` to log the flag's config error. That log is deduped per workspace so a broken config logs once, not once a second per dashboard.
- I/O failures during the write (e.g. rename EIO) are not refusals: they propagate to `handleRequest`'s generic 500; the test confirms the file is intact, no temp file is left, and the queue isn't wedged.

## 2026-10-17 · Phase 3 review (iter 1): codex COMMENT, claude APPROVE — porch advanced to phase_4

- Acted on two non-blocking points as a follow-up `[Phase: phase_3] fix` commit, because the client phases consume the route's contract:
  - An I/O failure while writing (ENOSPC/EACCES/EIO, or the file vanishing before the stat) is now a typed refusal `write-failed` (500, `{ ok: false, code, message }`) rather than escaping to `handleRequest`'s generic `{ error }` 500, so the card always has a message and keeps the draft. (claude)
  - An absolute `dashboard.decisionsFile` is a `config-error`, even when it points inside the workspace — the setting is defined as workspace-relative. (codex)
- Not acted on: logging the GET route's refusals (it is polled every couple of seconds while the tab is visible, so a misconfiguration would log on every poll; the state flag already logs a config error once per workspace). A directory at the configured path reads as `not-found` (nit, left as is).

## 2026-10-17 · Phase 4 (tab shell) — implemented after a context refresh

- `apps/web` now depends on `@cluesmith/codev-artifact-canvas` (workspace); its theme CSS is imported in `main.tsx`, before `index.css` so dashboard rules win. `pnpm add` also rewrote unrelated lockfile metadata (deprecation notes, a vitest/jsdom peer re-resolution); I trimmed the lockfile diff to the 3-line importer entry, and `pnpm install --frozen-lockfile` accepts it.
- `fetchDecisions()` never throws: `{ kind: 'document' | 'not-found' | 'error' }`. Any body without `ok` (the 401's plain text, a dispatcher `{ error }`, a malformed document) is an error.
- `useDecisions` is as planned: a 2 s poll while the tab is active and the page visible, skipping a tick while a fetch is in flight, and a generation counter bumped by each fetch start and by `applyDocument`. Mutation-checked: removing the guard fails the stale-poll test; removing the in-flight skip fails the overlap test. One deliberate deviation: the `error` state keeps the last document (`lastDocument`), so a transient failure (a tunnel blip) shows a banner over the last-read list instead of unmounting the cards under someone typing. `not-found` is the server's definitive answer and carries no document.
- Sticky tab: `useTabs` records "seen" with React's set-state-during-render pattern rather than a ref (same behaviour, no ref write during render). The tab sits after Team; `?tab=decisions` deep links work.
- Local environment, not this change: Node v26's built-in `localStorage` (undefined without `--localstorage-file`) shadows jsdom's, so 74 existing web tests fail locally (Terminal*, VirtualKeyboard, architect-toolbar). All 427 pass with `NODE_OPTIONS=--no-experimental-webstorage`, and CI runs Node 20. The new fetch test stubs localStorage like the other web tests do.
- Browser check (Playwright, throwaway Tower on 14819 with isolated `CODEV_AGENT_FARM_DIR`, socket dir and test DB; mkdtemp workspaces only): 15/15 — tab present on desktop and phone (no horizontal overflow at 390 px), items in file order, external write re-rendered in ~2.3 s, survives a tab switch, file removed → not-found with the tab kept, recovers when the file returns, no tab for a workspace without the file. Gotcha for phase 7: shellpers outlive a test Tower by design, so the harness must kill its own (match on its unique socket dir); my first run left two, verified as mine and killed by PID.

## 2026-10-17 · Phase 4 review (iter 1): codex APPROVE, claude APPROVE — porch advanced to phase_5

- No blocking issues. Not acted on, recorded for the review doc: a decisions file that first appears mid-session takes focus through `useTabs`' existing auto-switch to new tabs (the same as the Team and builder tabs); re-activating the tab while a read is in flight waits for the next 2 s tick; the file-problem notices get a `role` when phase 5 rewrites that area.

## 2026-10-17 · Phase 5 (read-only cards) — implemented after a context refresh

- `DecisionsView` now renders one `<article>` card per open item (named by its question): id, stamp, question, item notices, body via `MarkdownView`, the Q&A thread, the options (inert list, `Recommended` badge on the first), and the current ruling verbatim in a `<pre>` with the neutral note. `## Ruled` is an uncontrolled `<details>` (closed on load; React never sets `open`, so a poll re-render does not close it once the owner opens it).
- Deviation: the plan's stamp formula (`toLocaleString` with `dateStyle` + `timeStyle` + `timeZoneName`) throws in every engine — ECMA-402 refuses `timeZoneName` alongside the style shorthands. The view uses explicit fields (`year/month/day/hour/minute` + `timeZoneName: 'short'`), still in the viewer's locale and zone: e.g. "Oct 18, 2026, 12:38 AM EDT" for `2026-10-17 9:38 pm PT` viewed from New York. An unconverted stamp shows the raw text plus "Not converted: <reason>" in plain words (visible, not hover-only, so it reads on a phone).
- Links: one click handler on the view's root. Any click inside an `<a>` is `preventDefault`ed; only an `href` that is literally `http://` / `https://` (case-insensitive) is opened, via `window.open(href, '_blank', 'noopener')`. The raw attribute is tested, not the resolved `anchor.href`, so a repo-relative link (`[guide](codev/…)`) — which would resolve to the dashboard's own origin — stays inert rather than opening a dashboard URL in a new tab.
- Notices: file problems now carry `role="status"` (they can appear on a poll), item problems `role="note"` (the phase 4 review note).
- Canvas tokens are overridden on `.decisions-view .codev-artifact-canvas-rendered`, not on `.decisions-view`: the default theme declares them on the renderer's own root, so an ancestor override would lose.
- Cost noted: the dashboard bundle grows ~139 kB minified (1,125 → 1,264 kB) because `MarkdownView` brings markdown-it, linkify and DOMPurify — the price of baked decision 1 (reuse the canvas renderer). Lazy-loading the Decisions view would take it out of the main chunk; not done (not asked, and the chunk was already over Vite's 500 kB warning).
- Browser check (Playwright, throwaway Tower on 14819, mkdtemp workspace, viewer context `America/New_York`): 29/29. Cards in file order; PT, IANA (`Europe/London`) and `+05:30` stamps converted to EDT with the raw stamp in `title`; `IST` verbatim and marked; thread in order with one awaiting marker and the answer's continuation line; word + comment ruling and a REVIEW-comment ruling verbatim; missing-Your-word and duplicate notices; `## Ruled` closed on load, opens on click and stays open across polls; http links in a body and in `## Ruled` open a new page while the dashboard URL stays put; a repo-relative link is inert; at 390 px no page or card overflows. Desktop and phone screenshots checked by eye. First run was 28/29 only because my "no controls yet" check counted the dashboard's own textboxes page-wide; scoped to the view, it passes.
- Tests: `DecisionsView.test.tsx` rewritten for cards (39 tests), under `vi.stubEnv('TZ', 'America/New_York')` — the machine is PT, so a stamp test that passed by accident in the stamp's own zone is ruled out. Web suite 454 passed / 1 skipped (the pre-existing flaky Terminal test on main).

## 2026-10-17 · Phase 5 review (iter 1): codex APPROVE, claude APPROVE

- Acted on (follow-up `[Phase: phase_5] fix` commit): a heading with only an id rendered an empty `<h3>` and left the card with no accessible name (claude). The card is now named by its id when there is no question, and the empty heading is not rendered.
- Not acted on, deliberately: middle-click (`auxclick`) bypasses the view's click handler. The browser opens the link in a new tab, which never navigates the dashboard; for a repo-relative link that tab is a dashboard-origin URL — harmless, and the owner chose that click.
- Carried to phase 6 (claude): non-writable cards keep the inert option list; only `item.writable` cards get radios. Screenshots for the review doc are kept with the phase 5 browser script (scratchpad, not committed — binary).
