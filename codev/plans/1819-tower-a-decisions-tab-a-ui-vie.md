# Plan: Tower Decisions tab — a UI view of the pending-decisions file

**Specification**: [codev/specs/1819-tower-a-decisions-tab-a-ui-vie.md](../specs/1819-tower-a-decisions-tab-a-ui-vie.md)

## Executive Summary

The spec's Approach 1: the Tower server owns one parser for the decisions file, used by both the
read route and the write route; the dashboard is a thin view that renders the parsed document and
polls for changes while visible. The work is ordered so that each layer is testable before the
next uses it:

1. The **read model** — a pure, fence-aware parser for the approved markdown format plus the
   timestamp resolver — with the wire types in `codev-types`.
2. The **splice** — a pure function that inserts the owner's word/comment after the
   `**Your word:**` line or refuses with a named reason, verified by re-parsing.
3. The **Tower routes** — config key, canonical path containment, a read route, a write route
   that serializes writes per file and replaces the file atomically, and the `decisionsEnabled`
   state flag.
4. A **read-only Decisions tab** in the dashboard (cards, local-time stamps, Q&A thread, current
   ruling, collapsed `## Ruled`, live polling, safe links).
5. **Ruling from the tab** — options, comment box, Submit, drafts keyed by item id, held drafts,
   refusal display.
6. **Browser verification and docs** — a Playwright suite over a real Tower and the config/arch
   documentation.

The owner also asked, at plan time, whether the decisions file should become YAML or JSON. That
evaluation is the next section; it recommends **keeping markdown**, and this plan is written for
that. If the human chooses otherwise, the section says what changes.

## Format Evaluation: markdown, YAML/JSON, or a structured hybrid (owner ask — decide before implementation)

The file is written by two parties: the owner, by hand, in a Tower file tab (sometimes on a phone
through the tunnel, often late at night); and the hub architect `main`, an LLM using an editor
tool, several times an hour. The tab is a third reader/writer. The question is which format
serves all three best.

### Options considered

- **A. Keep markdown** (the approved spec).
- **B. YAML** — `pending-decisions.yaml`: a list of items with fields (`id`, `asked`,
  `question`, `problem`, …, `options: [{word, does}]`, `qa: [...]`, `your_word: |`), plus a
  `ruled:` list.
- **C. JSON** — the same structure as B in JSON.
- **D. Hybrid** — keep the markdown file, but give each item a small structured block (YAML front
  matter or a fenced `decision` block under the heading) carrying `id`, an ISO-8601 `asked`
  stamp and the options; prose and the ruling stay markdown.
  (A file-level front-matter *index* of items was rejected outright: it duplicates ids and
  options in two places in one file, and they would drift.)

### Weighing

| Criterion | A. Markdown | B. YAML | C. JSON | D. Hybrid |
|---|---|---|---|---|
| **Owner typing a ruling by hand** | Best. Type a word or sentence on the next line; no syntax. | Must type inside `your_word: \|` at the right indentation. A plain value containing `: ` ("Wait. That means: …"), or starting with `-`, `?`, `*`, `#`, `"`, changes or breaks the parse. Fiddly on a phone. | Worst. Quotes, escapes, commas; a newline must be `\n`. | Same as A — the owner never touches the block. |
| **Owner reading the raw file** (the file tab stays the fallback) | Renders as a document in the annotator. | Readable raw, but prose loses formatting. | Poor: long prose in one-line escaped strings. | As A, with a small block of metadata per item. |
| **Blast radius of one typo** | One item is flagged malformed; the rest still work. | Whole file fails to parse: the tab shows nothing **and** `main`'s scan breaks. | Whole file fails. | One item's block is invalid; the rest still work. |
| **`main`'s rewrite protocol** | Unchanged. Prose is markdown-native for an LLM; the Q&A paste is two list lines. | Rewritten. `main` must keep valid YAML through every edit — multi-paragraph prose in block scalars at exact indentation, quoting rules — using string-replacement edits, a known source of indentation breakage. The adopter's `decision-protocol.md` (sections 3 and 5), the scan, and the live file all change in lockstep. | As B, with escaping instead of indentation. | Changed: `main` must emit a correct block per item and keep its options consistent with the `**Your word:**` line, or the options move into the block and the owner no longer sees them in the prose. |
| **Tab parse complexity** | A custom fence-aware grammar (fences, ATX headings, Your-word line, option split, Q&A lines) plus the stamp grammar. Bounded and fully specified. | Parse is a library call (`js-yaml` is already a dependency). Prose fields are still markdown, so the renderer is unchanged. | Parse is `JSON.parse`. | Parse the block with `js-yaml`; item boundaries still need the heading/fence grammar. Saves the heading and option splitting; adds block validation. About the same overall. |
| **Tab write complexity** (baked decision 3: splice, no reformatting) | Text insertion after one line + re-parse verification. | `js-yaml` cannot round-trip: dumping rewrites the whole file and drops comments, which baked decision 3 forbids. So either a *text* splice into the YAML (locating the item's `your_word` scalar by text — an indentation-aware grammar that is harder than markdown's), or a new dependency (`yaml`, which keeps most but not all formatting), or a baked-decision change allowing reformatting. | `JSON.stringify` rewrites the whole file (forbidden); a text splice into an escaped JSON string is fragile. | As A — the ruling is still text after the Your-word line. |
| **Time zones** | Needs the abbreviation table + DST probing in the spec. | An ISO-8601 `asked` field with offset removes the table. | Same as B. | Same as B. |
| **Scope** | The approved spec as is. | Spec re-approval (baked decisions 3 and 4 name `### <id>` and `**Your word:**`), migration of the live file, the adopter's protocol doc and scan rewritten. | As B. | Spec amendment, protocol and hub changes. |

### Where the markdown grammar actually costs, and whether switching removes it

- **The time-zone table** is the most ambiguity-prone part. It is not a markdown problem: the
  spec *already accepts numeric offsets* (`±HH:MM`). If `main` writes heading stamps as
  `2026-10-17 12:10 am -07:00` instead of `… PT`, the tab resolves them exactly, with no table
  lookup and no DST probing, and no change to the tab. That is a hub-side choice the human can
  make at any time.
- **Fence-aware item boundaries and the re-parse verification** are what a byte-preserving
  splice needs in *any* text format. YAML and JSON move this work into an indentation- or
  escaping-aware text splice, or trade it for reformatting the owner's file.
- **Heading and option splitting and the Q&A lines** are a small, well-tested part of the
  parser. A structured format removes them, but they are not the bulk of the work. The routes,
  the serialized atomic write, the dashboard tab, drafts and the Playwright suite do not depend
  on the format.

### Recommendation: keep markdown

1. It is the only format the owner can rule in by hand without syntax. The file tab and chat
   remain the fallback, and the owner's original ask was "just a view of the dec doc."
2. One typo in YAML or JSON blanks the tab *and* breaks `main`'s scan for every item. Markdown
   fails one item at a time.
3. Switching does not remove the hard part of the write path (a byte-preserving splice), but it
   does add a cross-repo migration of the hub protocol and the live file.
4. The one real gain from structure — unambiguous timestamps — is available today, inside
   markdown, by having `main` write numeric offsets.

**If the human picks B, C or D instead:** the spec goes back for amendment (baked decisions 3
and 4, "Structural grammar", "Parsing", "Writing"). Phases 1–2 below are replaced by a schema +
validation phase and a write phase whose shape depends on the formatting ruling (text splice vs
the `yaml` CST library vs whole-file rewrite). The adopter's `decision-protocol.md`, the hub's
scan and the live file are migrated. Phases 3–6 carry over largely unchanged.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Decisions read model: parser, timestamp resolver, wire types"},
    {"id": "phase_2", "title": "Ruling splice with fail-loud validation"},
    {"id": "phase_3", "title": "Tower decisions routes: config, containment, serialized atomic writes"},
    {"id": "phase_4", "title": "Read-only Decisions tab in the dashboard"},
    {"id": "phase_5", "title": "Ruling from the tab: options, comment, drafts, submit"},
    {"id": "phase_6", "title": "Browser verification and documentation"}
  ]
}
```

## Phase Breakdown

### Phase 1: Decisions read model: parser, timestamp resolver, wire types

**Dependencies**: None

#### Objective

A pure function that turns the decisions file's text into the document the spec describes, so
that every later phase (splice, routes, UI) builds on one tested definition of "item", "option",
"current ruling" and "Q&A thread".

#### Files to Create / Modify

- `packages/types/src/api.ts` — wire types: `DecisionsDocument` (path, version, items, ruled
  markdown, file-level problems), `DecisionItem` (id, stamp, question, body markdown, options,
  current ruling, Q&A entries, fingerprint, problems, writable flag), `DecisionOption` (word,
  description, recommended), `DecisionStamp` (raw, instant ISO-UTC or null, reason when
  unconverted), `DecisionQaEntry` (kind `asked`/`answer`, name, time text, markdown),
  `DecisionsRuleRequest`, `DecisionsRuleResponse` (success with document | refusal with a code
  and message), refusal-code union; `DashboardState.decisionsEnabled?: boolean`.
- `packages/types/src/index.ts` — export the new types.
- `packages/codev/src/agent-farm/servers/decisions/grammar.ts` — line classification shared by
  the parser and the splice: splits text into lines with their original byte offsets and
  line-ending, tracks fences (≤3 spaces, backtick/tilde runs, length-matched close, unclosed runs
  to EOF), and classifies heading lines (ATX, ≤3 spaces, level 1–6), the `## Open` / `## Ruled`
  section headings, and Your-word lines (unfenced only).
- `packages/codev/src/agent-farm/servers/decisions/parse.ts` — `parseDecisions(text)`: an
  internal result with line ranges per section/item (needed by the splice), plus the projection
  to `DecisionsDocument`. Covers: id = first heading token; ` · ` split for stamp/question; options
  from Your-word segments (`` `word` `` + optional `= description`, first = recommended); body =
  heading → Your-word line, minus Q&A entries; current ruling = text after the Your-word line,
  trimmed, verbatim; Q&A entries (`- **You asked (t):**`, `- **<Name>'s answer (t):**`, straight
  or curly apostrophe, with indented continuation lines, file order); fingerprint = SHA-256 of
  the item's exact text; problems (no `## Open`, no/multiple Your-word lines, duplicate ids);
  writable = exactly one Your-word line ∧ unique id ∧ empty current ruling. `version` = SHA-256
  of the whole file.
- `packages/codev/src/agent-farm/servers/decisions/stamp.ts` — `resolveStamp(raw)`: the stamp
  grammar (`YYYY-MM-DD h:mm am|pm ZONE` / `YYYY-MM-DD HH:mm ZONE`), the zone forms and the exact
  abbreviation table from the spec, generic zones resolved through IANA, and conversion to an
  instant by `Intl.DateTimeFormat` offset probing. A wall-clock time is converted with each
  candidate offset (offsets sampled around the guess); one matching instant means success, none
  means a gap and two mean a fold, and both are returned unconverted with the reason.
- Tests: `packages/codev/src/agent-farm/__tests__/decisions-parse.test.ts`,
  `packages/codev/src/agent-farm/__tests__/decisions-stamp.test.ts`, with the issue's format
  example as a fixture under `packages/codev/src/agent-farm/__tests__/fixtures/decisions/`.

#### Deliverables

- [ ] Grammar module with fence/heading/Your-word classification and byte offsets.
- [ ] Parser producing the internal model and the wire document.
- [ ] Stamp resolver with the full zone table, gap/fold detection, no PT default.
- [ ] Wire types in `codev-types`.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Every "Grammar and parser" and "Timestamps" scenario in the spec's Test Scenarios passes.
- [ ] The parser and resolver have no filesystem or network imports. Results do not depend on
      the machine's time zone: the tests run under at least two `TZ` values (e.g. `UTC` and
      `Asia/Kolkata`) and produce identical results.
- [ ] `packages/types` builds, and its type-test guards still compile; `packages/codev` builds
      and its unit tests pass.

#### Test Plan

Unit tests (vitest), table-driven: the issue fixture; each structural edge (indented headings,
level-4 headings, fences of both kinds, longer closing fence, unclosed fence, fenced `###` /
`## Ruled` / `**Your word:**`); option edge cases (backticks/`=`/` / ` in descriptions, bare
`hold`); current-ruling cases including a REVIEW-comment-only ruling; Q&A entries (one pair, two
pairs, unanswered, orphan answer, curly apostrophe, multi-word name, continuation lines, removal
from body); malformed files; CRLF and no-trailing-newline files. Stamp table: PT in both DST
states, every fixed abbreviation, each generic zone, UTC/GMT/Z, numeric forms, an IANA name,
24-hour time, am/pm casing, unknown and excluded abbreviations, the gap and fold examples, and an
explicit test that no stamp without `PT` produces a Pacific offset. The suite runs under two `TZ`
values.

### Phase 2: Ruling splice with fail-loud validation

**Dependencies**: Phase 1

#### Objective

A pure function that applies the owner's ruling to the file text exactly as the spec's
"Writing (the splice)" defines, or refuses with a specific reason, so the write route is a thin
wrapper around tested logic.

#### Files to Create / Modify

- `packages/codev/src/agent-farm/servers/decisions/splice.ts` —
  `spliceRuling(text, { id, word?, comment?, fingerprint })` returns `{ ok: true, text }` or
  `{ ok: false, code, message }`. Request validation: at least one of word/comment; comment
  trimmed, ≤ 10,000 characters, no heading/fence/Your-word line per the grammar. State
  validation against a fresh parse: heading missing or duplicated in `## Open`; no or multiple
  Your-word lines; already has a current ruling; word not among current options; fingerprint
  mismatch. Insertion: the word on the next line; a blank line then the comment; a trailing blank
  line when the following line is not blank; a final newline supplied if the Your-word line ends
  the file; the file's own line ending for every inserted line. Verification: re-parse the
  result and compare sections, item ids and order, this item's options, and that this item's
  current ruling equals the inserted text; any difference is a `structure-changed` refusal.
- `packages/codev/src/agent-farm/__tests__/decisions-splice.test.ts`.

#### Deliverables

- [ ] `spliceRuling` with every refusal code from the spec and the re-parse verification.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Every "Splice" scenario in the spec's Test Scenarios passes, including byte-exact output
      for word / comment / word + comment / multi-line comment, and the three examples in the
      spec reproduced byte for byte.
- [ ] For every successful splice, the original text equals the result with the inserted range
      removed: every original byte is preserved, in order.
- [ ] Every refusal returns its own code and a human-readable message, and no text.
- [ ] Build and unit tests pass.

#### Test Plan

Unit tests built from fixtures: the "before" texts from the spec plus CRLF, no-trailing-newline
and heading-directly-after-Your-word variants. One test per refusal code, plus one that reaches
`structure-changed` only through verification (input crafted to slip past the explicit comment
checks, e.g. by mocking the request validator or using a construct the explicit checks don't name).
A property-style test runs a set of random comments that pass validation and checks that the
original text is preserved around the insertion.

### Phase 3: Tower decisions routes: config, containment, serialized atomic writes

**Dependencies**: Phase 1, Phase 2

#### Objective

Expose the read model and the splice over workspace-scoped Tower routes that resolve the path
from config, refuse escapes, serialize writes per file and replace the file atomically, and tell
the dashboard whether the tab should appear.

#### Files to Create / Modify

- `packages/codev/src/lib/config.ts` — `dashboard.decisionsFile?: string` on `CodevConfig`, with a
  doc comment (relative to the workspace root; default `codev/state/pending-decisions.md`).
- `packages/codev/src/agent-farm/servers/decisions/file.ts` —
  - `resolveDecisionsPath(workspacePath)`: reads config through `loadConfig` each call (no
    cache), joins with the workspace root, canonicalizes both the workspace root and the target
    with `realpath` (symlinks followed; for a target that does not exist yet, its parent is
    canonicalized), and refuses when the canonical target is outside the canonical root. Returns
    the canonical target, the display path, and whether it exists.
  - `writeFileAtomic(target, text)`: writes a temporary file beside the canonical target (same
    directory, so rename is atomic), applies the target's existing mode, `fsync`s, then renames
    it over the target. The temporary file is removed if any step fails. Because the canonical
    path is the symlink's *target*, a symlink on the configured path is preserved.
  - A module-level `KeyedSerializer` (reused from `servers/write-queue.ts`) keyed by canonical
    path, so at most one write per file runs at a time; each write re-reads the file inside its
    turn.
- `packages/codev/src/agent-farm/servers/decisions/routes.ts` — `handleDecisionsGet(res,
  workspacePath)` and `handleDecisionsRule(req, res, workspacePath)`:
  - GET → 200 `{ document }`; 404 when the file is absent; 400 with `outside-workspace` when
    containment fails.
  - POST → reads a size-capped JSON body; 400 for malformed input or comment-validation
    refusals; 404 when the file is absent; 409 for state refusals (`heading-missing`,
    `heading-duplicate`, `your-word-missing`, `your-word-multiple`, `already-ruled`,
    `unknown-word`, `item-changed`); 422 for `structure-changed`; 200 `{ ok: true, document }` on
    success, where the document is re-parsed from the bytes just written. Successful writes and
    refusals are logged with the item id and code.
- `packages/codev/src/agent-farm/servers/tower-routes.ts` — in `handleWorkspaceRoutes`' API
  section, next to the annotate route: `GET api/decisions` and `POST api/decisions/rule`
  dispatch to the handlers above; `handleWorkspaceState` sets `decisionsEnabled` from
  `resolveDecisionsPath` (true only when the canonical file exists inside the workspace).
- Tests: `packages/codev/src/agent-farm/__tests__/decisions-routes.test.ts` (handlers against
  real temporary workspaces); one auth case and one `decisionsEnabled` case added to
  `packages/codev/src/agent-farm/__tests__/tower-routes.test.ts`.

#### Deliverables

- [ ] Config key with default.
- [ ] Canonical path resolution with containment.
- [ ] Serialized, atomic, symlink-preserving write.
- [ ] Read and write routes wired in `tower-routes.ts`.
- [ ] `decisionsEnabled` on the workspace state response.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Every "Routes (integration)" scenario in the spec's Test Scenarios passes: read, absent,
      outside-workspace (direct and through a symlink), valid write → disk + returned document,
      refused write → file byte-identical, config override honoured, unauthenticated request
      rejected, two concurrent writes → exactly one applied and the other `already-ruled`,
      rename-based replacement (no truncated file if the rename never happens), symlink preserved
      with its target updated, permissions kept, state flag true/false.
- [ ] The client never supplies a path: neither route reads one from the request.
- [ ] Build and unit tests pass.

#### Test Plan

Integration tests against temporary directories as workspaces (realpath-normalized, like the
other route tests): a real file per test, calls to the handlers with mock request/response
objects, and assertions on disk state. Concurrency: two `handleDecisionsRule` calls started
without awaiting the first. Atomicity: rename stubbed to throw, then assert the original file is
intact and no temporary file remains. Auth: a request to `/workspace/<enc>/api/decisions` without
the key goes through `handleRequest` and is rejected.

### Phase 4: Read-only Decisions tab in the dashboard

**Dependencies**: Phase 3

#### Objective

The owner can open a Decisions tab and read every open item — question, local-time stamp,
rendered body, Q&A thread, current ruling, read-only notices — and the collapsed `## Ruled`
list, and it stays current without a refresh. No writing yet; this is already a better reading
surface than the raw file tab.

#### Files to Create / Modify

- `apps/web/package.json` (+ `pnpm-lock.yaml`) — add `@cluesmith/codev-artifact-canvas:
  workspace:*`. The `@cluesmith/codev^...` build filter and the CI order (artifact-canvas is
  built before the web tests) already put it ahead of the web build.
- `apps/web/src/lib/api.ts` — `fetchDecisions()` (and re-exports of the decisions types).
- `apps/web/src/hooks/useDecisions.ts` — fetch on activation; while the tab is active and
  `document.visibilityState === 'visible'`, poll every 2 s and replace the document only when
  `version` changes; stop polling when inactive or hidden, and fetch immediately when the
  document becomes visible again; `applyDocument(doc)` for Phase 5's write responses; error and
  not-found states.
- `apps/web/src/components/DecisionsView.tsx` — header (path, open count, file-level problems);
  one card per item in file order: id; stamp as
  `toLocaleString(undefined, { dateStyle, timeStyle, timeZoneName: 'short' })` with the raw
  stamp in `title`, or the raw stamp marked "not converted" with the reason; question; body via
  `MarkdownView`; Q&A thread (labels, time text verbatim, `MarkdownView` per entry, unanswered
  marker); options listed with the recommended badge (inert in this phase); current ruling
  shown verbatim in a `<pre>`-style block with the neutral note; duplicate / Your-word problem
  notices. `## Ruled` in a `<details>` (closed by default) rendered with `MarkdownView`. One
  click handler on the view's container: `http(s)` anchors open with
  `window.open(href, '_blank', 'noopener')`, other anchors are inert; `preventDefault` always.
- `apps/web/src/hooks/useTabs.ts` — `'decisions'` in `Tab['type']`;
  `{ id: 'decisions', type: 'decisions', label: 'Decisions', closable: false }` after Team when
  `state.decisionsEnabled`.
- `apps/web/src/components/TabBar.tsx` — an icon for `decisions`.
- `apps/web/src/components/App.tsx` — render `DecisionsView` in `renderPersistentContent`
  (shared by desktop and mobile), mounted while `decisionsEnabled` and shown with the same
  `display` toggle as Analytics/Team, so its state survives tab switches.
- `apps/web/src/main.tsx` or `DecisionsView.tsx` — import
  `@cluesmith/codev-artifact-canvas/default-theme.css` (its selectors are scoped to
  `.codev-artifact-canvas*`).
- `apps/web/src/index.css` — card, thread, notice and ruled-list styles; the canvas colour tokens
  overridden under `.decisions-view` to match the dashboard theme; cards readable at phone width.
- Tests: `apps/web/__tests__/DecisionsView.test.tsx`, `apps/web/__tests__/useDecisions.test.ts`,
  and an added case in `apps/web/__tests__/useTabs.architects.test.ts` (or a new
  `useTabs.decisions.test.ts`).

#### Deliverables

- [ ] Web dependency on `artifact-canvas`.
- [ ] `useDecisions` with visibility-aware polling.
- [ ] `DecisionsView` read-only rendering, including the Q&A thread, the current ruling, notices,
      the collapsed ruled list and link handling.
- [ ] Tab wiring (type, icon, conditional tab, persistent mount) for desktop and mobile.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] With `decisionsEnabled` the tab appears (desktop and mobile layouts); without it, it does
      not.
- [ ] Cards render in file order with converted or "not converted" stamps, bodies, the thread
      (not duplicated in the body), and the verbatim current ruling.
- [ ] `## Ruled` is collapsed by default.
- [ ] Clicking an `http(s)` link calls `window.open` with `_blank` and `noopener`; other links do
      nothing; the dashboard URL never changes.
- [ ] A new `version` from the poll re-renders; an unchanged version does not; polling stops
      when the tab is inactive or the page hidden.
- [ ] `apps/web` type-checks, builds and its tests pass; `packages/codev` builds (bundling the
      dashboard).
- [ ] The tab is checked in a browser against a running Tower (a quick manual Playwright
      screenshot), before Phase 5 adds interactivity.

#### Test Plan

Component tests (jsdom, Testing Library) from fixture documents: rendering of each card state;
the thread; stamps rendered in a fixed test `TZ`; the collapsed `<details>`; the link-click
handler with `window.open` stubbed. Hook tests with fake timers and a stubbed fetch: poll
cadence, version comparison, visibility pause/resume. Tab-model test for the conditional tab.

### Phase 5: Ruling from the tab: options, comment, drafts, submit

**Dependencies**: Phase 4

#### Objective

The owner can rule from the tab — choose an option, add a comment or question, submit — with
drafts that survive re-renders and never vanish silently, and with refusals shown on the card.

#### Files to Create / Modify

- `apps/web/src/lib/api.ts` — `postDecisionRuling(request)`, which returns the success document
  or the refusal (code, message) without throwing on a 4xx refusal.
- `apps/web/src/components/DecisionsView.tsx` —
  - Writable cards: a radio group of options (recommended badge, descriptions); a comment
    `<textarea>` (placeholder covering comments and questions); Submit, disabled unless a word
    is chosen or the comment is non-blank, and while that card's submit is in flight.
  - Drafts: `Map<itemId, { word?: string; comment: string }>` held in `DecisionsView` state (not
    per-card component state). Re-renders, re-ordering and tab switches don't lose drafts,
    because the view stays mounted.
  - Reconciliation on each new document: a selected word no longer among the item's options is
    cleared, with a notice, and the comment is kept. A non-empty draft whose item is gone from
    `## Open`, duplicated, or no longer writable because it gained text after its Your-word line
    becomes a **held** draft: a read-only card with the reason, selectable text and a Discard
    button.
  - Submit sends `{ id, word, comment, fingerprint }`. On success: `applyDocument` the returned
    document and clear the draft. On refusal: show the message on the card and keep the draft.
- `apps/web/src/hooks/useDecisions.ts` — `applyDocument` updates `version` too, so the next poll
  doesn't re-render the same content again.
- `apps/web/src/index.css` — radio, badge, textarea, error and held-draft styles.
- Tests: `apps/web/__tests__/DecisionsView.ruling.test.tsx`.

#### Deliverables

- [ ] Options, comment box and Submit on writable cards.
- [ ] Drafts keyed by item id, held drafts, option-removed notice.
- [ ] Success and refusal handling.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Every "Component" scenario in the spec's Test Scenarios passes, including a draft
      surviving a re-render with re-ordered items, the held-draft reasons, a refusal keeping the
      draft, and success clearing it and rendering the returned document.
- [ ] A question round-trip in the component (submit a question → read-only card with neutral
      note → new document with the pair above the Your-word line and nothing after it →
      writable, thread shown) passes.
- [ ] `apps/web` type-checks, builds and its tests pass.

#### Test Plan

Component tests with a stubbed `postDecisionRuling` and controlled document updates through the
hook: type and select, swap documents (new version, re-ordered, item removed, item ruled
elsewhere, options changed), and assert drafts, notices and held cards; submit success and each
refusal shape; in-flight disabling.

### Phase 6: Browser verification and documentation

**Dependencies**: Phase 5

#### Objective

Prove the user path end to end in a real browser against a real Tower (the project's UI rule
and the architect's pre-merge requirement), and document the setting and the tab.

#### Files to Create / Modify

- `packages/codev/src/agent-farm/__tests__/e2e/decisions-tab.test.ts` — Playwright, using the
  suite's existing workspace, auth fixtures and global setup. `beforeAll` writes a fixture
  decisions file at the default path in the test workspace. If a file already exists there, the
  suite fails loudly rather than overwrite real decisions. `afterAll` removes only the file the
  suite created. Scenarios:
  - the tab appears; choose an option, type a comment, submit → the file on disk holds exactly
    the inserted lines and the card shows the ruling;
  - an external write to the file (another item edited) re-renders the tab within a few seconds
    while a typed draft in another card is preserved;
  - question round-trip: submit a question; write the pair above the Your-word line and remove
    the question below it, as `main` would; the card shows the thread and accepts a word;
  - a link click opens a new page and leaves the dashboard URL unchanged;
  - mobile viewport: the tab is reachable and a submit works;
  - with the fixture removed and the page reloaded, there is no Decisions tab.
- `codev/resources/commands/agent-farm.md` and `codev-skeleton/resources/commands/agent-farm.md`
  — a "Decisions tab" subsection under Configuration: `dashboard.decisionsFile`, its default, the
  config layers, and the containment rule.
- `codev/resources/arch.md` — a "Decisions View" entry next to the Team View (conditional tab,
  `decisionsEnabled`, the two routes, server-side parser, serialized atomic writes, polling).

#### Deliverables

- [ ] Playwright suite for the Decisions tab.
- [ ] Config documentation in both trees.
- [ ] Architecture note.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] The Playwright suite passes locally against a Tower built from this branch, and in the
      dashboard-e2e workflow.
- [ ] Screenshots of the desktop and mobile tab from the run are recorded in the review.
- [ ] The docs in `codev/` and `codev-skeleton/` say the same thing.
- [ ] Full build and the codev and web unit suites pass.

#### Test Plan

Playwright over a real Tower started from `dist/` (the suite's `webServer`), as described above.
Manual pass: a human-eye check of both layouts from the screenshots.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| The human chooses YAML/JSON/hybrid after the plan is approved | Low | High | The decision is requested at the plan gate, before any code. The format evaluation says which phases change. |
| `Intl` offset probing mis-resolves around DST transitions | Medium | Medium | Gap/fold detection by candidate offsets; table-driven tests at the 2026 US transitions; suite run under two `TZ` values. |
| Web build can't resolve `artifact-canvas` (dist not built) | Medium | Low | The `@cluesmith/codev^...` build filter builds it first, and so does CI. Phase 4's acceptance includes a clean build. |
| The canvas theme clashes with the dark dashboard | Medium | Low | Override the canvas tokens under `.decisions-view`; verify visually in Phase 4. |
| The e2e fixture collides with a real decisions file in the test workspace | Low | High | The suite refuses to run if the file exists, and deletes only what it created. |
| Polling keeps a request open on a backgrounded phone | Low | Low | Poll only while the tab is active and the page is visible. |
| Atomic rename confuses the annotator file tab open on the same file | Low | Low | The annotator polls mtime and re-reads by path, so a rename is a normal change for it. Covered in the Phase 6 manual pass. |
| Route tests drift from the real dispatcher | Low | Medium | Handlers are unit-tested directly, and the auth/state cases go through `handleRequest`. |

## Documentation Updates

- `codev/resources/commands/agent-farm.md` and `codev-skeleton/resources/commands/agent-farm.md`
  — the `dashboard.decisionsFile` setting (Phase 6).
- `codev/resources/arch.md` — Decisions View entry (Phase 6). No hot-tier change: nothing here
  is a must-know-always fact.
- Moving the adopter's `decision-protocol.md` into the skeleton stays a follow-up, as the spec
  says.
