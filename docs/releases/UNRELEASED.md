# Unreleased

<!--
  TEMPLATE — copy to docs/releases/UNRELEASED.md at the start of each release cycle:

      cp docs/releases/UNRELEASED.template.md docs/releases/UNRELEASED.md

  Edit UNRELEASED.md across the cycle (the working copy). NEVER edit this
  template directly — it's the cold-start structure, untouched between cycles.

  Per-PR architect workflow (on the docs/vscode-changelog branch):
    1. cd worktrees/changelog                       # no fetch / no rebase — branches diverge by design
    2. Add the CHANGELOG entry to apps/vscode/CHANGELOG.md under [Unreleased]
       (add the [Unreleased] heading if it's missing — post-release state removes it)
    3. Add the matching release-notes entry to UNRELEASED.md under the right section:
         substantive change → its own ## section
         small vscode item  → Polish
         non-vscode change  → Other fixes
    4. Commit both files together; plain `git push` (fast-forward, no force)

  Why no rebase, ever: main moves with code merges, docs/vscode-changelog moves
  with changelog/release-notes entries — neither branch touches the other's
  files, so they diverge by design and reconcile at release time via merge.
  Rebasing rewrites commit hashes and forces force-pushes for zero real benefit.

  At release time:
    1. Rename the title to `# vX.Y.Z <Codename>` and add `Released: YYYY-MM-DD`
    2. Replace this entire comment block with the release Summary paragraph
       (one paragraph framing what shipped — lead with the biggest story)
    3. Fill in the Contributors section at the bottom
    4. git mv docs/releases/UNRELEASED.md docs/releases/vX.Y.Z-<codename>.md
    5. Commit, plain push, merge to main alongside the version bump
    6. Re-cp the template back to UNRELEASED.md to start the next cycle
-->

<!-- Release-time note (owner ruling, 2026-10-21): the VS Code extension was NOT published to the
     Marketplace for v3.3.5 or v3.3.6; the Marketplace's latest is 3.3.4 (2026-09-17), although
     main's apps/vscode/CHANGELOG.md was renamed to [3.3.5] by the version bump. This release's
     Marketplace publish is therefore the first since 3.3.4 and carries every extension item
     announced in v3.3.5-luxor.md. Say so in the Summary and in Install, and publish the
     extension as part of the release, not after it. -->

## A builder worktree is no longer a workspace of its own

A builder's worktree contains the whole repository, so opening one as a folder made Codev activate it as a separate workspace (#1809, PR #1846): it recorded the worktree as a known workspace, started an architect for it, and the rows piled up over time with nothing to clear them. Because such a window reads the parent checkout's data, it also surfaced the parent's lanes: gate notifications for other lanes, each carrying an Approve button that would have approved that lane's gate, along with builder counts, the sidebar badge, the attention list, and spawn notifications that could open another lane's terminal.

A worktree window now attaches to its parent checkout read-only and never activates it. The Agents view is absent, the parent's notifications, counts and badge stay with the parent's own window, the contextual panel is pinned to the worktree's own builder, and the Workspace view keeps only its dev rows. Reviewing files in that window, comments included, is unchanged.

On the operator side, Tower refuses to activate a builder worktree and points at the parent instead, and it clears worktree rows left by earlier windows when it starts. A worktree window that is still running is reported rather than stopped: the message names how to stop it, and for one Tower cannot reach it gives the process id instead. Starting Codev logs one line with the counts.

Known and expected: the Agents view can paint briefly as a worktree window loads, before it disappears.

## Polish

<!-- Small vscode items as bullets:
       - **<Headline>** (#<issue>, PR #<pr>). <One short paragraph of context.>
     Move out to its own ## section if the entry grows past ~3 sentences. -->

## Other fixes (dashboard, porch, infrastructure)

<!-- Non-vscode work that ships in the npm release. Same bullet shape as Polish. -->

## Breaking changes

None.

## Install

```bash
npm install -g @cluesmith/codev@X.Y.Z
afx tower stop && afx tower start
```

The VS Code extension ships separately via the Marketplace — `Codev` extension by `cluesmith.codev`, version `X.Y.Z`.

## Contributors

<!-- Filled at release time. Use the topic-first voice from prior release notes:
       - **<Name> (@<handle>)** — <topic>: <what they did across which PRs>.
       - Builders working under AIR / BUGFIX / PIR / SPIR protocols across the PRs in this release.
     Source: git log v<prev>..HEAD --merges --pretty=format:"%h %an %s" -->
