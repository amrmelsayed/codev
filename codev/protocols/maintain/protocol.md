# MAINTAIN Protocol

## Overview

MAINTAIN is a periodic maintenance protocol for keeping codebases healthy. Unlike SPIDER/TICK (which have sequential phases), MAINTAIN is a **task list** where tasks can run in parallel and some require human review.

**Core Principle**: Regular maintenance prevents technical debt accumulation.

## When to Use MAINTAIN

- When the user/architect requests it
- Before a release (clean slate for shipping)
- Quarterly maintenance window
- After completing a major feature
- When the codebase feels "crusty"

## Execution Model

MAINTAIN is executed by a Builder, spawned by the Architect:

```
Architect: "Time for maintenance"
    ↓
af spawn --protocol maintain
    ↓
Builder works through task list
    ↓
PR with maintenance changes
    ↓
Architect reviews → Builder merges
```

## Prerequisites

Before starting MAINTAIN:
1. Check `codev/maintain/` for last maintenance run
2. Note the base commit from that run
3. Focus on changes since that commit: `git log --oneline <base-commit>..HEAD`

---

## Maintenance Files

Each maintenance run creates a numbered file in `codev/maintain/`:

```
codev/maintain/
├── 0001.md
├── 0002.md
└── ...
```

**Template**: `codev/protocols/maintain/templates/maintenance-run.md`

The file records:
- Base commit (starting point)
- Tasks completed
- Findings and deferred items
- Summary

---

## Task List

### Code Hygiene Tasks

| Task | Parallelizable | Human Review? | Description |
|------|----------------|---------------|-------------|
| Remove dead code | Yes | No | Delete unused functions, imports, unreachable code |
| Remove unused dependencies | Yes | Yes | Check package.json/requirements.txt for unused packages |
| Clean unused flags | Yes | No | Remove feature flags that are always on/off |
| Fix flaky tests | No | Yes | Investigate and fix intermittently failing tests |
| Update outdated dependencies | Yes | Yes | Bump dependencies with breaking change review |

**Tools**:
```bash
# TypeScript/JavaScript
npx ts-prune          # Find unused exports
npx depcheck          # Find unused dependencies

# Python
ruff check --select F401   # Find unused imports
```

### Documentation Sync Tasks

| Task | Parallelizable | Human Review? | Description |
|------|----------------|---------------|-------------|
| Update arch.md | Yes | No | Sync architecture doc with actual codebase |
| Generate lessons-learned.md | Yes | Yes | Extract wisdom from review documents |
| Sync CLAUDE.md ↔ AGENTS.md | Yes | No | Ensure both files match |
| Prune documentation | Yes | Yes | Remove obsolete info, keep CLAUDE.md/README.md under 400 lines |
| Check spec/plan/review consistency | Yes | Yes | Find specs without reviews, plans that don't match code |
| Remove stale doc references | Yes | No | Delete references to deleted code/files |

### Project Tracking Tasks

| Task | Parallelizable | Human Review? | Description |
|------|----------------|---------------|-------------|
| Update projectlist.md status | Yes | No | Update project statuses |
| Archive terminal projects | Yes | No | Move completed/abandoned to terminal section |

### Framework Tasks

| Task | Parallelizable | Human Review? | Description |
|------|----------------|---------------|-------------|
| Run codev update | No | Yes | Update codev framework to latest version |

---

## Task Details

### Update arch.md

Scan the actual codebase and update `codev/resources/arch.md`:

**Discovery phase**:
1. `git log --oneline <base-commit>..HEAD` - what changed since last maintenance
2. `ls -R` key directories to find new files/modules
3. `grep` for new exports, classes, key functions
4. Review new/modified specs: `git diff <base-commit>..HEAD --name-only -- codev/specs/`
5. Review new/modified plans: `git diff <base-commit>..HEAD --name-only -- codev/plans/`

**Update arch.md**:
1. Verify directory structure matches documented structure
2. Update component descriptions for changed modules
3. Add new utilities/helpers discovered
4. Remove references to deleted code
5. Update technology stack if dependencies changed
6. Document new integration points or APIs
7. Capture architectural decisions from new specs/plans

**Primary sources** (specs/plans):
- Architectural decisions from specs
- Component relationships from plans
- Design rationale and tradeoffs

**Secondary sources** (code):
- File locations and their purpose
- Key functions/classes and what they do
- Data flow and dependencies
- Configuration options
- CLI commands and flags

**What NOT to include**:
- Implementation details that change frequently
- Line numbers (they go stale)
- Full API documentation (use JSDoc/docstrings for that)

### Generate lessons-learned.md

Extract actionable wisdom from review documents into `codev/resources/lessons-learned.md`:

**Discovery phase**:
1. Find new/modified reviews: `git diff <base-commit>..HEAD --name-only -- codev/reviews/`
2. Read each new/modified review file

**Extract from reviews**:
1. Read all files in `codev/reviews/`
2. Extract lessons that are:
   - Actionable (not just "we learned X")
   - Durable (still relevant)
   - General (applicable beyond one project)
3. Organize by topic (Testing, Architecture, Process, etc.)
4. Link back to source review
5. Prune outdated lessons

**Template**:
```markdown
# Lessons Learned

## Testing
- [From 0001] Always use XDG sandboxing in tests to avoid touching real $HOME
- [From 0009] Verify dependencies actually export what you expect

## Architecture
- [From 0008] Single source of truth beats distributed state
- [From 0031] SQLite with WAL mode handles concurrency better than JSON files

## Process
- [From 0001] Multi-agent consultation catches issues humans miss
```

### Sync CLAUDE.md ↔ AGENTS.md

Ensure both instruction files contain the same content:

1. Diff the two files
2. Identify divergence
3. Update the stale one to match
4. Both should be identical (per AGENTS.md standard)

### Prune Documentation

**CRITICAL: Documentation pruning requires JUSTIFICATION for every deletion.**

Size targets (~400 lines for CLAUDE.md/README.md) are **guidelines, not mandates**. Never sacrifice clarity or important content just to hit a line count.

**Before deleting ANY content, document:**
1. **What** is being removed (quote or summarize)
2. **Why** it's being removed:
   - `OBSOLETE` - References deleted code/features
   - `DUPLICATIVE` - Same info exists elsewhere (cite location)
   - `MOVED` - Relocated to another file (cite new location)
   - `VERBOSE` - Can be condensed without losing meaning
3. **Decision** - Delete, move, or keep with note

**Create a deletion log in your maintenance file:**
```markdown
## Documentation Changes

### arch.md
| Section | Action | Reason |
|---------|--------|--------|
| "Old API docs" | DELETED | OBSOLETE - API removed in v1.2 |
| "Installation" | MOVED | To INSTALL.md for brevity |
| "Architecture patterns" | KEPT | Still relevant, referenced by builders |
```

**Files to review**:
- `codev/resources/arch.md` - remove references to deleted code/modules
- `codev/resources/lessons-learned.md` - remove outdated lessons
- `CLAUDE.md` / `AGENTS.md` - target ~400 lines (guideline, not hard limit)
- `README.md` - target ~400 lines (guideline, not hard limit)

**Conservative approach**:
- When in doubt, KEEP the content
- If unsure, ASK the architect before deleting
- Prefer MOVING over DELETING
- Never delete "development patterns" or "best practices" sections without explicit approval

**What to extract (move, don't delete)**:
- Detailed command references → `codev/docs/commands/`
- Protocol details → `codev/protocols/*/protocol.md`
- Tool configuration → `codev/resources/`

**What to ALWAYS keep in CLAUDE.md**:
- Git prohibitions and safety rules
- Critical workflow instructions
- Protocol selection guidance
- Consultation requirements
- Links to detailed docs

### Remove Dead Code

Use static analysis to find and remove unused code:

1. Run analysis tools (ts-prune, depcheck, ruff)
2. Review findings for false positives
3. Use `git rm` to remove confirmed dead code
4. Commit with descriptive message

**Important**: Use `git rm`, not `rm`. Git history preserves deleted files.

### Update Dependencies

Review and update outdated dependencies:

1. Run `npm outdated` or equivalent
2. Categorize updates:
   - Patch: Safe to auto-update
   - Minor: Review changelog
   - Major: Requires human review for breaking changes
3. Update and test
4. Document any migration steps

### Run codev update

Update the codev framework to the latest version:

```bash
codev update
```

This updates protocols, templates, and agents while preserving your specs, plans, and reviews.

---

## Validation

After completing tasks, validate the codebase:

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No import/module errors
- [ ] Documentation links resolve
- [ ] Linter passes

If validation fails, investigate and fix before creating PR.

---

## Rollback Strategy

### For code changes
```bash
# Git history preserves everything
git log --all --full-history -- path/to/file
git checkout <commit>~1 -- path/to/file
```

### For untracked files
Move to `codev/maintain/.trash/YYYY-MM-DD/` before deleting. Retained for 30 days.

---

## Commit Messages

```
[Maintain] Remove 5 unused exports
[Maintain] Update arch.md with new utilities
[Maintain] Generate lessons-learned.md
[Maintain] Sync CLAUDE.md with AGENTS.md
[Maintain] Update dependencies (patch)
```

---

## Governance

MAINTAIN is an **operational protocol**, not a feature development protocol:

| Document | Required? |
|----------|-----------|
| Spec | No |
| Plan | No |
| Review | No |
| Consultation | No (human review of PR is sufficient) |

**Exception**: If MAINTAIN reveals need for architectural changes, those should follow SPIDER.

---

## Best Practices

1. **Don't be aggressive**: When in doubt, KEEP the content. It's easier to delete later than to recover lost knowledge.
2. **Check git blame**: Understand why code/docs exist before removing
3. **Run full test suite**: Not just affected tests
4. **Group related changes**: One commit per logical change
5. **Document EVERY deletion**: Include what, why, and where (if moved)
6. **Ask when unsure**: Consult architect before removing "important-looking" content
7. **Prefer moving over deleting**: Extract to another file rather than removing entirely
8. **Size targets are guidelines**: Never sacrifice clarity to hit a line count

---

## Anti-Patterns

1. **Aggressive rewriting without explanation**: "I condensed it" is not a reason
2. **Deleting without documenting why**: Every deletion needs justification in the maintenance file
3. **Hitting line count targets at all costs**: 400 lines is a guideline, not a mandate
4. **Removing "patterns" or "best practices" sections**: These are high-value content
5. **Deleting everything the audit finds**: Review each item individually
6. **Skipping validation**: "It looked dead/obsolete" is not validation
7. **Using `rm` instead of `git rm`**: Lose history
8. **Making changes the architect can't review**: Big deletions need clear explanations
