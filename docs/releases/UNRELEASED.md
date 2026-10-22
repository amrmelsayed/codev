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

## Governance docs drafted from the codebase: `codev bootstrap-docs` (#1797, PR #1808; #1811)

A project that adopts Codev on a running codebase starts with the four governance docs as placeholders, and nothing filled them in. `codev bootstrap-docs` now does: it launches your agent (Claude Code or Codex) in a session that works in the update-arch-docs skill's bootstrap mode, surveys the build wiring, entry points, service boundaries and persistence, explores the history (the project's own record first, then one line per PR, older eras, fixes and reverts, what was removed), and drafts only the files that are still placeholders. Curated files are read, never edited. When the session ends, Codev validates the drafts against the hot-tier caps, reports anything that changed outside the eligible files, and sends the drafts to the three reviewers for feedback. Nothing is committed for you. `codev adopt` offers the run when it finishes, and `codev update` says when the docs are still placeholders.

The agent follows the project's installed skill when it matches the package, so the rules it writes to are the rules the drafts are checked against. That needed `codev update` to keep skills current (#1811): a shipped skill you never edited is now replaced with the package's version, matched against every version Codev has shipped; an edited one keeps your content and gets a `.codev-new` copy of each changed file for the merge session, the same treatment CLAUDE.md gets. An empty skill folder is filled. `codev update --dry-run` now previews all of this and writes nothing; it used to write `CLAUDE.md.codev-new` and `AGENTS.md.codev-new` during a dry run. Symlinked skills, governance paths and `.codev-new` copies are never written through.

## Codev IDE server from npm (#1789, PR #1806)

The Codev IDE server is a Codev-branded VS Code server that Tower spawns, owns and forwards at the `/ide/` prefix, so a workspace opens in the browser at `http://localhost:4100/ide/?folder=<absolute path>`. Until now you had to find and point at the server binary yourself. Install it with `npm i -g @cluesmith/codev-ide` (or `afx ide install`) and run `afx ide start` with no flags: afx finds the server on PATH, next to the running codev package, or under the global node_modules. `--server-path` still works as an override, and a missing or unusable server is refused in the CLI before Tower is contacted.

Tower now does three things on every start. It checks the server's version against the minimum it supports (1.128.0) and refuses an older one, naming the installed version and the upgrade command. It installs the Codev sidebar, which now ships inside @cluesmith/codev, into `~/.agent-farm/ide-extensions`, skipping the install when that version is already there and leaving other extensions alone. Then it spawns the server with that extensions directory. A failed check or install refuses the start and leaves any running server untouched. A server that is already live on the port is adopted, never killed; when it predates the current start, the command prints a restart hint. `afx ide status` shows the server and sidebar versions, and the first start can take a minute or more.

Because the server loads extensions only from `~/.agent-farm/ide-extensions`, extensions installed into its default directory are no longer loaded; install them into that directory with the server's own `--install-extension`. The `--default-folder` flag is gone: the folder is chosen per connection, and Tower manages several workspaces, so a single default made no sense.

## Jira as the issue tracker (#1740, PR #1848)

Codev can now run a project whose issues live in Jira Cloud while the code stays on GitHub. Set `"forge": {"provider": "jira"}` in `.codev/config.json`, with `jira-site` and optionally `jira-project`, and log in once with Atlassian's `acli`; Codev never reads or stores a Jira token. The Jira preset covers viewing, listing and searching issues, commenting, recently closed items and the current user, and every PR operation keeps running through `gh`, the same hybrid shape Linear uses. `codev doctor` reports both logins for Jira and Linear workspaces, and no longer warns about the provider's own settings.

Tracker keys such as `ENG-123` now carry through everything that used to assume a number: `afx spawn`, worktree and branch names, porch project ids, PR linking (`[PIR #ENG-1]`, `Fixes #ENG-1`), builder lookup and cleanup, the overview, the dashboard and the VS Code extension. Numeric ids resolve exactly as before, because every numeric pattern is still tried first, and the overview now prefers the issue id it stored at spawn time over parsing a folder name. A random short id for an issue-less spawn can no longer take the shape of a key. Closing a Jira issue when its PR merges stays a manual step: GitHub's closing keywords do nothing for a Jira key.

## Polish

<!-- Small vscode items as bullets:
       - **<Headline>** (#<issue>, PR #<pr>). <One short paragraph of context.>
     Move out to its own ## section if the entry grows past ~3 sentences. -->

## Other fixes (dashboard, porch, infrastructure)

<!-- Non-vscode work that ships in the npm release. Same bullet shape as Polish. -->

## Breaking changes

- **Published types: `createdAt` is now optional on backlog and issue-search items, and `OverviewData.issueIdKind` is new** (#1740, PR #1848). Jira's search cannot return dates, so consumers of `@cluesmith/codev-types` (the Stream Deck plugin and the client SDK) must treat a missing `createdAt` as unknown rather than a date.

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
