# Spec 0039: Codev CLI (First-Class Command)

**Status:** spec-draft
**Protocol:** SPIDER
**Priority:** High
**Dependencies:** 0005 (TypeScript CLI), 0022 (Consult Tool)
**Blocks:** None
**Consultation:** 4-way review (Gemini, Codex, Claude, Architect) - all decisions resolved

---

## Problem Statement

Codev currently lacks a unified entry point. Users interact with multiple disconnected tools:

1. **agent-farm** - TypeScript CLI for builder orchestration (npm package)
2. **consult** - Python CLI for AI consultation (loose script)
3. **codev-doctor** - Bash script for dependency checking
4. **codev-skeleton/** - Manual copy for new projects

This creates friction:
- Multiple installation steps
- No unified `codev` command
- agent-farm is tightly coupled to current directory (reads `codev/roles/builder.md` locally)
- No standard way to initialize new codev projects or adopt existing repos

---

## Requirements

### Core CLI Commands

1. **`codev init`** - Create a new codev project
   - Creates new directory with `codev/` structure from embedded skeleton
   - Initializes CLAUDE.md/AGENTS.md
   - Sets up git hooks (optional)
   - Interactive or `--yes` for defaults
   - **Use case**: Starting a fresh project

2. **`codev adopt`** - Add codev to an existing project
   - Adds `codev/` directory to current repo without overwriting existing files
   - Detects and warns about conflicts (e.g., existing CLAUDE.md)
   - Offers to merge or skip conflicting files
   - **Use case**: Adding codev to an existing codebase

3. **`codev doctor`** - Check system dependencies
   - Port existing codev-doctor functionality to TypeScript
   - Check: node, npm, git, gh, tmux, ttyd
   - Suggest installation commands for missing deps
   - Exit 0 if all good, non-zero if missing critical deps

4. **`codev update`** - Update codev templates
   - Updates protocols, templates, agents from embedded skeleton
   - Preserves user's specs/plans/reviews (never touched)
   - **Merge strategy for protocol files**:
     1. Compute hash of user's current file
     2. If unchanged from last update, overwrite safely
     3. If user modified, write new version as `filename.codev-new`
     4. Show diff and prompt user to merge manually
   - `--dry-run` to preview changes
   - `--force` to overwrite all (dangerous)

5. **`codev tower`** - Cross-project dashboard
   - Shows all running agent-farm instances across projects
   - Launch capability for multiple projects
   - Lives in codev (not af) because it's cross-project scope

6. **`codev consult`** - AI consultation
   - Native TypeScript implementation (ported from Python)
   - `codev consult --model gemini spec 39`
   - `codev consult --model codex pr 33`
   - Shells out to gemini-cli, codex, claude CLIs
   - Unified with rest of codev codebase

### Package Structure

**Single merged package** (`@cluesmith/codev`):
- One npm package containing all functionality
- agent-farm source merged into codev
- consult ported to TypeScript
- Simpler for users: `npm install -g @cluesmith/codev`

### Installation

```bash
# Global install
npm install -g @cluesmith/codev

# Or via npx for one-off use
npx @cluesmith/codev init my-project
npx @cluesmith/codev doctor
```

### Command Routing

After installation, users get two commands:

```bash
# codev - framework management
codev init my-project    # New project
codev adopt              # Add to existing project
codev doctor             # Check deps
codev update             # Update templates
codev tower              # Cross-project dashboard
codev consult            # AI consultation

# af - agent-farm operations (backwards compatible)
af start                 # Start single-project dashboard
af spawn                 # Spawn builder
af status                # Project status
af cleanup               # Clean up builders
# ... all existing af commands
```

**Design choice**: `af` is NOT aliased as `codev af`. They are separate entry points for different purposes:
- `codev` = framework-level operations
- `af` = project-level builder operations

---

## Technical Approach

### Architecture: Merged Single Package

```
packages/codev/                    # @cluesmith/codev
├── src/
│   ├── cli.ts                    # Main codev entry point
│   ├── af-cli.ts                 # af entry point (thin shim)
│   ├── commands/
│   │   ├── init.ts
│   │   ├── adopt.ts
│   │   ├── doctor.ts
│   │   ├── update.ts
│   │   ├── tower.ts
│   │   └── consult/
│   │       ├── index.ts
│   │       ├── gemini.ts
│   │       ├── codex.ts
│   │       └── claude.ts
│   ├── agent-farm/               # Merged from @cluesmith/agent-farm
│   │   ├── commands/
│   │   │   ├── start.ts
│   │   │   ├── spawn.ts
│   │   │   ├── status.ts
│   │   │   └── ...
│   │   └── lib/
│   │       ├── state.ts
│   │       ├── worktree.ts
│   │       └── ...
│   └── lib/
│       ├── skeleton.ts           # Template copying logic
│       └── config.ts
├── templates/                    # Embedded codev-skeleton
│   ├── protocols/
│   ├── roles/
│   ├── CLAUDE.md.template
│   └── ...
├── bin/
│   ├── codev.js                  # Main entry
│   └── af.js                     # Shim: runs codev agent-farm subcommand
├── package.json
└── tsconfig.json
```

### Binary Entry Points

**package.json:**
```json
{
  "name": "@cluesmith/codev",
  "bin": {
    "codev": "./bin/codev.js",
    "af": "./bin/af.js",
    "consult": "./bin/consult.js"
  }
}
```

**bin/consult.js** (thin shim):
```javascript
#!/usr/bin/env node
// consult is shorthand for codev consult
const { run } = require('../dist/cli.js');
run(['consult', ...process.argv.slice(2)]);
```

**bin/af.js** (thin shim):
```javascript
#!/usr/bin/env node
// af is shorthand for codev agent-farm
const { run } = require('../dist/cli.js');
run(['agent-farm', ...process.argv.slice(2)]);
```

### Consult Implementation (TypeScript)

Port from Python - ~200 lines of glue code:

```typescript
// src/commands/consult/index.ts
const MODEL_CONFIG = {
  gemini: { cli: 'gemini', args: ['--yolo'], envVar: 'GEMINI_SYSTEM_MD' },
  codex: { cli: 'codex', args: ['exec', '--full-auto'], envVar: 'CODEX_SYSTEM_MESSAGE' },
  claude: { cli: 'claude', args: ['--print', '--dangerously-skip-permissions'], envVar: null }
};

export async function consult(model: string, subcommand: string, target: string) {
  const config = MODEL_CONFIG[model];
  const query = await buildQuery(subcommand, target);
  const role = await loadRole();

  const env = config.envVar ? { [config.envVar]: role } : {};
  const args = config.envVar ? [...config.args, query] : [...config.args, role + '\n\n' + query];

  spawn(config.cli, args, { env: { ...process.env, ...env }, stdio: 'inherit' });
}
```

### Skeleton Embedding

The codev-skeleton is embedded in the npm package at build time:
- `templates/` directory contains protocol files, roles, templates
- `codev init` and `codev adopt` copy from this embedded skeleton
- Ensures offline capability and version consistency
- `codev update` compares embedded vs local and offers merge

**Note**: `af` commands still require a local `codev/` directory with roles. The embedded skeleton is only used for init/adopt/update, not runtime.

---

## Migration Path

### For Existing agent-farm Users

1. `npm uninstall -g @cluesmith/agent-farm`
2. `npm install -g @cluesmith/codev`
3. `af` commands continue to work unchanged
4. New `codev` commands available
5. `codev update` to get latest protocol templates

### For New Users

1. `npm install -g @cluesmith/codev`
2. `codev doctor` to verify system dependencies
3. For new project: `codev init my-project`
4. For existing project: `cd my-project && codev adopt`
5. `af start` to begin development

---

## Success Criteria

- [ ] `npm install -g @cluesmith/codev` installs everything needed
- [ ] `codev init` creates working codev project from skeleton
- [ ] `codev adopt` adds codev to existing project without data loss
- [ ] `codev doctor` checks all dependencies (no Python required)
- [ ] `codev update` updates templates with safe merge strategy
- [ ] `codev tower` shows cross-project dashboard
- [ ] `codev consult` works for AI consultation (TypeScript native)
- [ ] Existing `af` commands continue to work unchanged
- [ ] Single version number for entire toolchain

---

## Out of Scope

- GUI installer
- Windows support (Unix-first)
- IDE plugins
- Cloud/hosted version
- Stateful consult sessions (future spec)

---

## Design Decisions

1. **MERGE agent-farm into codev** (4-way unanimous)
   - Single codebase, single package.json
   - No version sync issues with shared dependencies (better-sqlite3, etc.)
   - Native module stability (single compilation)
   - Simplifies publishing and installation

2. **PORT consult to TypeScript** (3:1 majority)
   - Eliminates polyglot toolchain (no Python/uv dependency)
   - Unified test runner and error handling
   - ~4-6 hours to port 200 lines of glue code
   - Single `npm install` for users

3. **SEPARATE binary entry points** (3-way consensus)
   - `bin/codev.js` - main CLI
   - `bin/af.js` - thin shim calling codev agent-farm
   - Clearer mental model than basename detection
   - Easier testing and future flexibility

4. **Skeleton embedded in package**
   - Ship in `templates/` directory
   - Ensures offline capability
   - Version matches CLI version
   - `af` still reads local `codev/roles/` at runtime

5. **Package naming**: `@cluesmith/codev` (scoped npm package)

---

## Risks

1. **Breaking existing agent-farm users**: Mitigated by backwards-compatible `af` command
2. **Package name conflicts**: Check npm for availability before publishing
3. **Large package size**: Monitor bundle size, consider tree-shaking

---

## Testing Strategy

1. **Unit tests**: Command routing, skeleton copying, config parsing
2. **Integration tests**: `codev init` creates valid project, `af` shim works
3. **E2E tests**: Full workflow from install to `af spawn`
4. **Mock strategy**: Mock external CLIs (gemini, codex, claude) in consult tests
