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
