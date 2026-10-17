# Specification: Tower Decisions tab — a UI view of the pending-decisions file

<!--
SPEC vs PLAN BOUNDARY:
This spec defines WHAT and WHY. The plan defines HOW and WHEN.
-->

## Problem Statement

In a multi-architect workspace, one architect (`main`) is the hub for owner decisions. Every
other architect sends it a decision; `main` rewrites it in plain words and posts it into one
file, `codev/state/pending-decisions.md`, under `## Open`. The owner rules by opening that file
in a Tower file tab and typing a word (and often a sentence) under the item's `**Your word:**`
line.

That works, but the owner is ruling on several decisions at once, often late at night, often
from a phone through the Tower tunnel, in a raw-markdown editor. Each ruling means: find the
item, find its `**Your word:**` line, put the cursor in the right place, type the word exactly as
offered, save. It is easy to put the text in the wrong item, mistype an option, or save while
`main` is rewriting the file. The owner asked for "just a view of the dec doc": a card per open
item, the options as click boxes with the recommended one marked, a comment box, and the
owner's choice written back into the file exactly where they would have typed it.

Affected: the workspace owner (rules decisions), the hub architect `main` (reads rulings out of
the file; must see no difference between a tab-written ruling and a hand-typed one), and the
other architects (receive the relayed rulings; unaffected directly).

## Current State

- **The decision process** (from the issue). Architects send `afx send architect:main "DECISION
  <name>-<n>: <title> …"`. `main` posts the item under `## Open`, newest first. The owner opens
  the file with `afx open codev/state/pending-decisions.md`, types a word on/after the item's
  `**Your word:**` line (or a sentence anywhere under the item, or in chat), and says `ddu` in
  `main`'s terminal — or a Tower cron notices the file changed. `main` scans every open item
  (a regex over the text after `**Your word:**`), relays `RULING <id>: <word>` to the
  originating architect, moves the item to `## Ruled` as a one-line record, and later appends
  the architect's `DONE <id>: …` to that record. Only `main` and the owner write the file.
- **The file format** (verbatim from the issue):

  ```markdown
  # Pending owner decisions — all architects (hub: main)

  Rule inline: a letter or one word on an item's **Your word:** line is enough. "approve" = approve AND merge.
  Newest first. Only main edits this file; architects send items with `afx send architect:main "DECISION …"`.

  _Status: N open — <ids>. Written h:mm pm (<what changed>)._

  ## Open

  ### <architect>-<n> · <YYYY-MM-DD h:mm am/pm PT> · <Question the owner answers, naming the artifact by what it does>

  - **Problem:** (or **Context:**) what is wrong or undecided, as the owner would see it.
  - **Root cause:** why (for a fix). For a choice: **Options:** (a) `word` = … (b) `word` = …
  - **Fix:** what the change does, in product terms.
  - **Testing:** the receipt.
  - **Cost:** dollars or minutes, only when money is involved.
  - **Recommendation (<architect>):** one line; may be followed by "Main's note: …".
  - **Links:** URLs and repo paths.

  **Your word:** `<first word, recommended>` = what it does / `<second word>` = what it does / `hold`

  ## Ruled

  - **<id>** · ruled `<word>` <time> · relayed <time>: <what happened> · DONE <time>: <architect's report>
  ```

- **What Tower offers today.** A file tab (`afx open`) renders the file in the annotator
  iframe (`open.html`): markdown preview, inline edit + save of the whole file, and a 1-second
  mtime poll that auto-reloads when the file changes on disk (suppressed while the user has
  unsaved edits). There is no structured view, no per-item affordance, and a save writes the
  whole buffer back — so an edit made from a stale buffer can overwrite `main`'s newer write.
- **Time zones.** Item headings carry a local-time stamp with a zone (`PT` in the requesting
  owner's file). Nothing in Tower interprets these stamps today.
- **Precedent for a conditional tab.** The dashboard's Team tab appears only when the workspace
  has `codev/team/`; the workspace `state` response carries a `teamEnabled` flag computed per
  request.

## Desired State

A **Decisions** tab in the Tower dashboard (desktop and mobile layouts) for any workspace that
has the decisions file at its configured path. Opening it shows:

1. **A card per `## Open` item, in file order** (the file is newest-first by convention; the
   tab is a view and does not re-sort). Each card shows the id, the heading's timestamp rendered
   in the viewer's local time zone (the original stamp available on hover), the question, and
   the item body rendered as markdown with URLs as clickable links.
2. **The options from the `**Your word:**` line as radio buttons**, each with its description
   (the text after `=`), the first option visibly marked *Recommended*.
3. **One free-text comment box** per card, for anything the owner wants to say instead of, or
   in addition to, a word.
4. **A Submit action** per card. It writes into the file, under that item, directly after the
   `**Your word:**` line, exactly what the owner would have typed by hand: the chosen word on
   its own line, then the comment as a paragraph. Nothing else in the file changes.
5. **The current ruling.** Any text already present after the item's `**Your word:**` line
   (typed by hand or written by an earlier submit) is shown on the card as the current ruling.
6. **`## Ruled`** below the cards: a read-only list, collapsed by default.
7. **Live.** When the file changes on disk the tab re-renders from the new content. A
   half-written comment or a selected-but-unsubmitted option survives the re-render.
8. **Failures are loud.** A submit that cannot be applied cleanly is refused with a message on
   that card, and the owner's comment stays in the box.

For `main`, nothing changes: a ruling written by the tab is byte-for-byte what a hand-typed
ruling of the same word and sentence would be, so the existing scan and the `ddu` / cron flow
pick it up unchanged.

### Behavioural detail

**Parsing (the read model).** The file is parsed fresh on every read; there is no cached copy.
- Sections are the level-2 headings `## Open` and `## Ruled`. Items are level-3 (`### `)
  headings inside `## Open`; an item's text runs to the next `###` or `##` heading or end of
  file. Headings inside fenced code blocks are content, not structure.
- **Item id** = the heading's first whitespace-delimited token. The rest of the heading is split
  on ` · `: the first part is the timestamp, the remainder (re-joined) is the question. A heading
  without separators yields an id and a question with no timestamp.
- **`**Your word:**` line** = a line in the item that begins with `**Your word:**`. The text after
  the label is split on ` / `; each segment that begins with a backticked word contributes one
  option: the word, plus the description after `=` if present. The first option is the
  recommended one.
- **Body** = the item's lines between the heading and the `**Your word:**` line.
  **Current ruling** = the item's text after the `**Your word:**` line, trimmed; empty means
  unruled.
- **`## Ruled`** = the section's content, shown as markdown, read-only.
- **Malformed input is reported, not guessed at.** A file with no `## Open` section shows an
  error naming the problem. An item with no `**Your word:**` line, or more than one, is shown
  with its body and a notice that the tab cannot write a ruling for it (Submit disabled). Two
  items with the same id are both shown, flagged as duplicates, with Submit disabled.

**Timestamps (no assumed zone).** The stamp `YYYY-MM-DD h:mm am|pm <ZONE>` (24-hour `HH:mm` is
also accepted) is resolved to an absolute instant using the zone written in the text, then
displayed in the viewer's local zone. Accepted zone forms: `UTC`/`GMT`/`Z`; numeric offsets
(`+05:30`, `UTC+5:30`, `GMT-7`); IANA names (`Europe/London`); and an explicit, documented table
of abbreviations — the North-American generic zones (`PT`, `MT`, `CT`, `ET`, `AKT`, `HT`, which
follow DST for the stamp's date) and their specific forms (`PST`/`PDT`, `MST`/`MDT`, `CST`/`CDT`,
`EST`/`EDT`, …), plus a small set of unambiguous others. A stamp whose zone is not recognized is
displayed verbatim, marked as not converted — never interpreted in any default zone. Nothing in
the parser defaults to, or special-cases, Pacific time.

**Writing (the splice).** A submit carries the item id, the chosen word (optional), the comment
(optional; at least one of the two is required), and a fingerprint of the item's text as the
card last rendered it. At write time the server re-reads the file from disk and:
- refuses if the `### <id>` heading is missing from `## Open` or appears more than once
  (baked decision 3);
- refuses if the item has no `**Your word:**` line or more than one;
- refuses if the chosen word is not one of the options on the item's *current* `**Your word:**`
  line;
- refuses if the item's text no longer matches the submitted fingerprint (the item was edited
  after the owner last saw it — the owner re-reads and resubmits). Changes elsewhere in the file
  (the status line, other items, `## Ruled`) do not trigger this;
- refuses a comment containing a line that begins with `#` or contains `**Your word:**`, since
  either would corrupt the item structure that `main` and the tab both parse;
- otherwise inserts, directly after the `**Your word:**` line: a blank line, the word on its own
  line (if given), a blank line and the comment (if given) — separated by a blank line from
  whatever follows. Every pre-existing byte of the file is preserved in place, the file's line
  ending style (LF or CRLF) is used for inserted lines, and no other part of the file is
  touched.

  Example — before:

  ```markdown
  **Your word:** `accept` = merge as is / `rework` = send back / `hold`

  ### main-11 · …
  ```

  after choosing `accept` with a comment:

  ```markdown
  **Your word:** `accept` = merge as is / `rework` = send back / `hold`

  accept

  accept but don't add the limit on additional tests. That could easily backfire.

  ### main-11 · …
  ```

- A refused write returns a clear, specific error; the card shows it and keeps the draft.
- A second submit on an already-ruled item is allowed (the owner may change their mind). Its
  text is inserted directly after the `**Your word:**` line, i.e. above the earlier ruling, so
  the newest ruling reads first — consistent with the file's newest-first convention.

**Drafts.** Each card's draft (selected option + comment text) is held in component state keyed
by item id, not DOM position, so re-renders, re-ordering and tab switches do not lose it. A
successful submit clears that card's draft. If an option a draft selected disappears from the
item's options, the selection is dropped and the card says so; the comment is kept. If an item
with a non-empty draft disappears from `## Open` (for example `main` moved it to `## Ruled`), its
card stays visible in a "no longer open" state showing the draft text so it can be copied, with
Submit disabled and a Discard action — an unsaved comment is never silently lost.

**Configuration.** The file path is a Tower setting in `.codev/config.json` (key
`dashboard.decisionsFile`), relative to the workspace root, default
`codev/state/pending-decisions.md`, read through the normal config layers (so
`.codev/config.local.json` can override it). A configured path that resolves outside the
workspace is rejected with an error rather than read or written. The client never supplies a
file path; both read and write resolve the path server-side from configuration.

**Visibility.** The workspace `state` response carries a flag indicating whether the decisions
file exists at the configured path; the Decisions tab appears only when it does (Team-tab
precedent). If the file disappears while the tab is open, the tab shows a not-found message.

## Success Criteria

- [ ] A workspace whose decisions file exists at the configured path shows a **Decisions** tab
      in the Tower dashboard, on desktop and in the mobile layout; a workspace without it shows
      no such tab.
- [ ] Each `## Open` item renders as a card in file order with id, local-time timestamp,
      question, and markdown body; URLs in the body are clickable and open outside the
      dashboard.
- [ ] Each card shows one radio per option on its `**Your word:**` line, in order, with
      descriptions; the first is visibly marked recommended.
- [ ] Each card has one comment box and a Submit action; Submit is disabled until an option is
      selected or a comment is non-empty, and while a submit is in flight.
- [ ] Submitting writes the word line and comment paragraph directly after that item's
      `**Your word:**` line; a byte diff of the file before/after shows only the inserted lines.
- [ ] The result of a tab submit is identical to the hand-typed equivalent (same bytes), so
      `main`'s existing scan reads it unchanged.
- [ ] Every refusal case in "Writing (the splice)" returns a specific error, leaves the file
      byte-identical, shows the error on the card, and keeps the draft.
- [ ] Existing text after a `**Your word:**` line shows as the card's current ruling.
- [ ] `## Ruled` shows below the cards, read-only, collapsed by default.
- [ ] An external write to the file is reflected in the open tab within a few seconds, without
      a manual refresh; a draft comment and a selected option survive that re-render.
- [ ] A draft on an item that leaves `## Open` stays visible as "no longer open" until
      discarded.
- [ ] Timestamps convert from the zone written in the stamp to the viewer's local zone for every
      accepted zone form; an unrecognized zone is shown verbatim and marked unconverted. Tests
      cover at least PT across both DST states, a non-US offset, UTC, and an unknown zone; no
      code path assumes PT.
- [ ] The path is configurable via `dashboard.decisionsFile`; the default is
      `codev/state/pending-decisions.md`; a path outside the workspace is refused.
- [ ] The parser and the splice are pure functions with their own unit tests against the
      format in this spec, including malformed-input and edge cases.
- [ ] The tab is exercised in a real browser via Playwright (render, choose + comment + submit,
      file updated on disk, external change re-renders with the draft intact) before the PR is
      called done.
- [ ] The new routes are covered by the same request authentication as every other workspace
      API route.

## Constraints

### Baked Decisions (architect, issue #1819 triage comment — verbatim, fixed)

1. **Tower serves it, nothing new runs.** The tab is a new tab type in the existing Tower
   dashboard, backed by workspace-scoped Tower API routes next to the `afx open` annotate route
   in `tower-routes.ts`. Markdown rendering reuses what the dashboard already has
   (`artifact-canvas` MarkdownView), not a second renderer.
2. **The file is the only state.** Read on open, re-read on file change, no cache that can
   disagree with disk. The configurable path lives in `.codev/config.json` with the default
   `codev/state/pending-decisions.md`, consistent with where every other Tower setting lives.
3. **Writes are a splice, and they fail loudly.** The write endpoint locates the item by its
   `### <id>` heading, inserts the word line and the comment paragraph directly after the
   `**Your word:**` line, and writes nothing else. If the heading is missing or appears twice at
   write time, the write is refused with a clear error and the owner's text stays in the comment
   box. No reformatting, no merge heuristics, no fallback.
4. **The parser is a pure function with its own tests** against the format in the issue body:
   ids from the heading's first token, options from the backticked words on the
   `**Your word:**` line, first option recommended, existing owner text after that line shown as
   the current ruling. Per the owner's comment, the heading's time zone is parsed from the text
   and rendered in the viewer's local zone. Nothing may assume PT.
5. **Unsaved comment survives re-render.** Keyed by item id in component state, not by DOM
   position.
6. **`## Ruled` is read-only** and collapsed by default.

Out of scope, as the issue says: notifications, a store, per-architect files. Moving
`decision-protocol.md` into the skeleton is a follow-up once the tab ships.

Note on decision 1: the web dashboard does not yet depend on `@cluesmith/codev-artifact-canvas`
(only the VS Code extension does); reusing `MarkdownView` means adding that dependency, which
is the intended reading of the decision, not a new renderer.

Note on decision 3: this spec adds further refusals (missing/duplicate `**Your word:**` line,
word not among current options, item changed since rendered, structure-breaking comment). Each
is a stricter fail-loud check in the same spirit; none reformats, merges, or falls back.

### Other constraints

- **Owner time-zone rule** (issue comment, 12:11 am): the tab parses whatever zone the file
  states and renders in the viewer's zone; nothing may assume PT.
- **Server/client isolation (#1189)**: server code and the SDK never import each other; the web
  dashboard talks to Tower over HTTP only.
- **Request authentication (GHSA-xvjp-7748-v88v)**: every new route sits behind the existing
  Tower key check; there is no unauthenticated read or write.
- **UI verification**: Tower UI changes are verified in a browser via Playwright before being
  called done (project testing rule; the architect's triage also requires a Playwright run and
  a 3-way integration review before merge).
- **Single source of truth**: the file. No database rows, no localStorage copy of decisions.

## Assumptions

- The issue's format section is authoritative; the adopter's `decision-protocol.md` (sections 3
  and 5) matches it.
- `main` keeps the file newest-first; the tab does not re-sort.
- The owner's word is a single token from the offered options; anything else goes in the
  comment.
- `main`'s scan tolerates a blank line between the `**Your word:**` line and the word (the issue
  says the tab should write "exactly what the owner would have typed" and that the scan "picks
  it up unchanged"; the example above is that shape).
- Anyone with access to the workspace's Tower dashboard is acting as the owner, exactly as with
  the existing file tab's edit + save. No per-user identity is recorded.
- The file is small (tens of KB at most), so reading and parsing it on every request and poll
  is cheap.

## Solution Approaches

### Approach 1: Server parses and splices; client renders JSON; client polls (recommended)

The server owns one parser used by both the read route and the write route. The read route
returns the parsed document (items with id, raw stamp, resolved instant, question, body
markdown, options, current ruling, fingerprint, problems; the ruled markdown; a document
version). The write route re-reads, re-parses, validates, splices. The client renders cards,
converts the resolved instant to local time, and while the tab is visible polls the read route
every couple of seconds, re-rendering only when the version changes.

- **Pros:** one parser for read and write, so what the owner sees and what the write validates
  can never disagree; the client stays a thin view; time-zone resolution happens once with a
  full ICU (Node); polling matches the existing annotator's mtime poll, needs no new watcher
  lifecycle in Tower, and works unchanged through the tunnel and on mobile.
- **Cons:** up to a poll interval of lag; a request every few seconds while the tab is visible
  (negligible for a small file, and suspended when hidden).
- **Risk/complexity:** low.

### Approach 2: Client parses raw text; server only splices

The read route returns the raw file; the client parses it. The write route still has to locate
the item and validate, so it needs its own parse.

- **Pros:** minimal read route.
- **Cons:** two parsers (or a parser shared across the client/server boundary, which the
  isolation rule makes awkward) that must agree byte-for-byte on item boundaries; a disagreement
  writes into the wrong place or refuses spuriously.
- **Risk/complexity:** medium; violates "single source of truth" in spirit.

### Approach 3: Server push (file watcher + SSE) instead of polling

Tower watches the decisions file per workspace and pushes a change event over the existing SSE
stream; the tab refetches on that event.

- **Pros:** near-instant updates, no polling traffic.
- **Cons:** a watcher per workspace with its own start/stop lifecycle across workspace
  activation, file creation/deletion and editors that replace files by rename; the dashboard's
  SSE consumer currently refetches on any event, so a new event type needs plumbing in the
  shared SSE hook. More moving parts for a file written a few times an hour.
- **Risk/complexity:** medium. Worth revisiting only if polling proves inadequate.

**Recommendation: Approach 1.** It keeps one parser, keeps Tower free of new long-lived
watchers, and mirrors how the existing file tab already detects change.

## Open Questions

**Critical** — none open. The baked decisions and the issue settle scope, data flow, and the
write format.

**Important** (shape the design; the spec takes a position — confirm at the spec gate):
1. *Explicit Submit vs write-on-click.* The issue says "on choose / submit". This spec uses an
   explicit Submit per card so a misclick never writes and word + comment land in one splice.
2. *Re-ruling an already-ruled item.* Allowed, inserted above the earlier ruling (newest first).
   Alternative: refuse when a ruling exists, forcing hand-editing to change one's mind.
3. *Item fingerprint check.* Refusing when the item changed since it was rendered is stricter
   than baked decision 3 requires. It guards against ruling on text `main` has since rewritten;
   the cost is an occasional resubmit.
4. *Config key name.* `dashboard.decisionsFile`, next to the existing `dashboard.frontend`.
5. *Blank-line separation.* The splice puts a blank line between the `**Your word:**` line, the
   word, and the comment, so each renders as its own paragraph in a markdown view. Writing the
   word on the very next line (no blank) would render it joined to the options line. Assumes
   `main`'s scan reads past a blank line (see Assumptions).

**Nice-to-know:**
6. Repo paths in **Links:** could open as Tower file tabs; this spec makes URLs clickable and
   leaves repo paths as rendered text. Follow-up if wanted.
7. An open-count badge on the tab label (`Decisions (3)`) would need the state route to parse
   the file on every state poll; left out.
8. Persisting drafts across a page reload (localStorage) is not required; drafts survive
   re-render and tab switches only.

## Test Scenarios

**Parser (unit, pure):**
- The issue's format example parses to the expected items, options (order, descriptions,
  recommended = first), body, empty current ruling, and ruled content.
- Multiple items; ids from first heading token; question containing ` · `; heading with no
  separators.
- Option descriptions containing backticks and `=`; a `hold` option with no description.
- Existing owner text after the `**Your word:**` line (word only; word + sentence; multiple
  paragraphs) appears as the current ruling.
- `###` inside a fenced code block is not an item boundary.
- Malformed: no `## Open`; item without `**Your word:**`; two `**Your word:**` lines; duplicate
  ids; empty `## Open`; no `## Ruled`; CRLF file; file without trailing newline.

**Timestamps (unit):**
- `2026-07-01 3:05 pm PT` → PDT instant; `2026-12-01 3:05 pm PT` → PST instant.
- `PST`/`PDT` explicit, `ET`, `UTC`, `Z`, `+05:30`, `UTC+5:30`, `GMT-7`, `Europe/London`,
  24-hour `15:05`.
- Unknown zone (`XYZ`), missing zone, malformed time → unconverted, raw text preserved.
- No path yields a PT interpretation for a stamp that does not say PT.

**Splice (unit, pure):**
- Word only; comment only; word + comment; multi-line comment — output equals the expected bytes
  and every original byte is preserved in order.
- Inserting above an existing ruling; `**Your word:**` line as the last line with and without a
  trailing newline; next line non-blank; CRLF file uses CRLF.
- Each refusal: heading missing, heading duplicated, no/two `**Your word:**` lines, unknown word,
  fingerprint mismatch, comment with a `#` line, comment containing `**Your word:**`, empty word
  and comment. Each returns a specific error and no output text.
- An unrelated change elsewhere in the file (status line, another item) does not refuse.

**Routes (integration):**
- Read returns the parsed document for the configured path; 404-shaped response when absent;
  error when the configured path escapes the workspace.
- Write applies a valid splice to disk; refused writes leave the file byte-identical and return
  the error; config override of the path is honoured; requests without the Tower key are
  rejected.
- The workspace state flag is true/false with file present/absent.

**Component (unit, jsdom):**
- Cards, radios, recommended marker, comment box, current ruling, collapsed ruled list render
  from a parsed document.
- A draft (option + comment) survives a re-render with new content, including re-ordering.
- An option disappearing drops the selection with a notice and keeps the comment.
- An item with a draft leaving `## Open` shows the "no longer open" card with the draft; Discard
  removes it.
- A refused submit shows the error and keeps the draft; a successful one clears it.

**End-to-end (Playwright, real Tower + browser):**
- Workspace with a fixture decisions file: the tab appears; choose an option, type a comment,
  submit; the file on disk contains exactly the inserted lines.
- An external write to the file re-renders the tab within a few seconds while a typed draft in
  another card is preserved.
- Mobile viewport: the tab is reachable and a submit works.
- Workspace without the file: no Decisions tab.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Owner submits while `main` is mid-rewrite and one write clobbers the other | Low | High | The splice is a read-validate-write done in one short server step against the current disk content; the fingerprint refuses if the item changed. `main`'s editor (Claude Code's Edit) refuses to write a file modified since it read it, so a tab write between `main`'s read and write forces `main` to re-read rather than clobber. |
| The owner's annotator file tab is in edit mode with an older buffer and saves over a tab-written ruling | Low | Medium | Pre-existing behaviour of the annotator's whole-file save; documented. The Decisions tab is the intended ruling surface. |
| Tab and `main`'s scan disagree on where an item ends | Low | High | One server-side parser for read and write; item boundaries tested against the issue's format; malformed items are flagged and not writable. |
| A comment injects structure (`###`, `## Ruled`, `**Your word:**`) and corrupts the file | Low | High | Such comments are refused with a clear error before any write. |
| Ambiguous time-zone abbreviations (`IST`, `BST`, `CST`) are misread | Medium | Low | Only an explicit, documented abbreviation table is accepted; anything else is shown verbatim as unconverted. |
| Rendering untrusted markdown in the dashboard | Low | Medium | `MarkdownView` sanitizes with DOMPurify (scripts, event handlers, `javascript:` URLs stripped); option labels and descriptions render as React text. |
| A malicious config path aims writes outside the workspace | Low | High | Paths resolving outside the workspace root are refused; the client never sends a path. |
| Polling cost | Low | Low | Poll only while the tab and the browser tab are visible; small file. |
| Adding `artifact-canvas` to the web build breaks build ordering | Medium | Low | Covered in the plan (workspace dependency + build order); CI build check. |

## References

- Issue #1819 (body: process and format; comments: owner time-zone rule, architect baked
  decisions).
- `packages/codev/src/agent-farm/servers/tower-routes.ts` — workspace routes, the annotate
  route, file tab save.
- `packages/codev/templates/open.html` — annotator's 1s mtime auto-reload (polling precedent).
- `packages/artifact-canvas/src/renderer/MarkdownView.tsx`, `renderer.ts` — sanitized
  markdown-it renderer (`linkify: true`).
- `apps/web/src/hooks/useTabs.ts`, `apps/web/src/components/App.tsx`, `TeamView.tsx` — tab
  model and the conditional Team tab precedent (`teamEnabled`).
- `packages/codev/src/lib/config.ts` — config layers and the existing `dashboard` block.
- `packages/codev/src/agent-farm/__tests__/e2e/team-tab.test.ts` — Playwright tab test
  precedent.
- `codev/resources/testing-guide.md` — UI verification requirement.
