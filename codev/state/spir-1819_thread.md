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
