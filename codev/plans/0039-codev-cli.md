# Plan 0039: Codev CLI Implementation

**Spec:** codev/specs/0039-codev-cli.md
**Protocol:** SPIDER
**Estimated effort:** 3-4 days

---

## Overview

Consolidate agent-farm, consult, and new codev commands into a single `@cluesmith/codev` npm package.

## Phase 1: Foundation (Day 1)

### 1.1 Create Package Structure

```bash
mkdir -p packages/codev/{src/commands,src/lib,bin,templates}
```

**Files to create:**
- `packages/codev/package.json` - New package config
- `packages/codev/tsconfig.json` - TypeScript config
- `packages/codev/src/cli.ts` - Main entry point
- `packages/codev/bin/codev.js` - Bin entry
- `packages/codev/bin/af.js` - Thin shim for af

### 1.2 Implement `codev doctor`

Port from `codev/bin/codev-doctor` (bash) to TypeScript:

```typescript
// src/commands/doctor.ts
const DEPENDENCIES = [
  { name: 'node', cmd: 'node --version', minVersion: '18.0.0' },
  { name: 'npm', cmd: 'npm --version' },
  { name: 'git', cmd: 'git --version' },
  { name: 'gh', cmd: 'gh --version', optional: true },
  { name: 'tmux', cmd: 'tmux -V' },
  { name: 'ttyd', cmd: 'ttyd --version' },
];
```

**Tests:**
- Missing dependency detection
- Version comparison
- Exit codes (0 = all good, 1 = missing critical)

### 1.3 Implement `codev init`

```typescript
// src/commands/init.ts
export async function init(projectName: string, options: { yes?: boolean }) {
  const targetDir = path.resolve(projectName);

  if (fs.existsSync(targetDir)) {
    throw new Error(`Directory ${projectName} already exists`);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  await copyTemplate(getTemplatesDir(), targetDir);

  // Interactive prompts unless --yes
  if (!options.yes) {
    await promptProjectConfig(targetDir);
  }
}
```

**Tests:**
- Creates directory structure
- Copies all template files
- Handles existing directory error

### 1.4 Implement `codev adopt`

```typescript
// src/commands/adopt.ts
export async function adopt(options: { yes?: boolean }) {
  const cwd = process.cwd();
  const codevDir = path.join(cwd, 'codev');

  if (fs.existsSync(codevDir)) {
    throw new Error('codev/ already exists. Use `codev update` instead.');
  }

  const conflicts = detectConflicts(cwd);
  if (conflicts.length > 0 && !options.yes) {
    await promptConflictResolution(conflicts);
  }

  await copyTemplate(getTemplatesDir(), cwd, { skipConflicts: true });
}
```

**Tests:**
- Detects existing codev/ directory
- Handles CLAUDE.md conflicts
- Skips files correctly

---

## Phase 2: Merge agent-farm (Day 2)

### 2.1 Copy agent-farm Source

```bash
# Move source files
cp -r agent-farm/src/* packages/codev/src/agent-farm/

# Move templates
cp -r agent-farm/templates/* packages/codev/templates/
```

### 2.2 Update Import Paths

All imports in agent-farm code need updating:
- `../lib/state` → `./lib/state`
- Keep internal structure intact

### 2.3 Wire Up af Shim

```javascript
// bin/af.js
#!/usr/bin/env node
const { run } = require('../dist/cli.js');

// Inject 'agent-farm' as first argument
const args = process.argv.slice(2);
run(['agent-farm', ...args]);
```

### 2.4 Add agent-farm Subcommand

```typescript
// src/cli.ts
program
  .command('agent-farm')
  .alias('af')  // Also accessible as codev af
  .description('Agent farm commands (start, spawn, status, etc.)')
  .action(() => {
    // Delegate to agent-farm CLI
    require('./agent-farm/cli').run(process.argv.slice(3));
  });
```

**Tests:**
- `af start` works
- `af spawn --project 0039` works
- All existing af commands unchanged

---

## Phase 3: Port Consult (Day 2-3)

### 3.1 Create Consult Module

```typescript
// src/commands/consult/index.ts
import { spawn } from 'child_process';
import { Command } from 'commander';

interface ModelConfig {
  cli: string;
  args: string[];
  envVar: string | null;
}

const MODELS: Record<string, ModelConfig> = {
  gemini: { cli: 'gemini', args: ['--yolo'], envVar: 'GEMINI_SYSTEM_MD' },
  pro: { cli: 'gemini', args: ['--yolo'], envVar: 'GEMINI_SYSTEM_MD' },
  codex: { cli: 'codex', args: ['exec', '--full-auto'], envVar: 'CODEX_SYSTEM_MESSAGE' },
  gpt: { cli: 'codex', args: ['exec', '--full-auto'], envVar: 'CODEX_SYSTEM_MESSAGE' },
  claude: { cli: 'claude', args: ['--print', '--dangerously-skip-permissions'], envVar: null },
  opus: { cli: 'claude', args: ['--print', '--dangerously-skip-permissions'], envVar: null },
};
```

### 3.2 Implement Subcommands

```typescript
// PR review
async function reviewPR(model: string, prNumber: number) {
  const query = await buildPRQuery(prNumber);
  await runConsult(model, query);
}

// Spec review
async function reviewSpec(model: string, specNumber: number) {
  const specPath = await findSpec(specNumber);
  const query = await buildSpecQuery(specPath);
  await runConsult(model, query);
}

// Plan review
async function reviewPlan(model: string, planNumber: number) {
  const planPath = await findPlan(planNumber);
  const query = await buildPlanQuery(planPath);
  await runConsult(model, query);
}

// General query
async function general(model: string, query: string) {
  await runConsult(model, query);
}
```

### 3.3 Port Helper Functions

From Python consult:
- `loadRole()` - Read consultant.md
- `buildQuery()` - Format query with context
- `findSpec()` / `findPlan()` - Locate files by number
- History logging to `.consult/history.log`

**Tests:**
- Model routing works
- File location works
- CLI passthrough works
- Mock external CLIs

---

## Phase 4: Update Command (Day 3)

### 4.1 Implement Update Logic

```typescript
// src/commands/update.ts
interface UpdateResult {
  updated: string[];
  skipped: string[];
  conflicts: string[];
}

export async function update(options: { dryRun?: boolean; force?: boolean }): Promise<UpdateResult> {
  const embedded = getTemplatesDir();
  const local = path.join(process.cwd(), 'codev');

  const result: UpdateResult = { updated: [], skipped: [], conflicts: [] };

  for (const file of getUpdatableFiles()) {
    const embeddedPath = path.join(embedded, file);
    const localPath = path.join(local, file);

    if (!fs.existsSync(localPath)) {
      // New file - copy it
      if (!options.dryRun) {
        fs.copyFileSync(embeddedPath, localPath);
      }
      result.updated.push(file);
      continue;
    }

    const localHash = hashFile(localPath);
    const storedHash = getStoredHash(file);

    if (localHash === storedHash || options.force) {
      // Unchanged or force - safe to overwrite
      if (!options.dryRun) {
        fs.copyFileSync(embeddedPath, localPath);
        storeHash(file, hashFile(localPath));
      }
      result.updated.push(file);
    } else {
      // Modified by user - write as .codev-new
      if (!options.dryRun) {
        fs.copyFileSync(embeddedPath, localPath + '.codev-new');
      }
      result.conflicts.push(file);
    }
  }

  return result;
}
```

### 4.2 Hash Storage

```typescript
// Store hashes in codev/.update-hashes.json
interface HashStore {
  [filename: string]: string;
}
```

**Tests:**
- New files copied
- Unchanged files overwritten
- Modified files create .codev-new
- --dry-run shows but doesn't change
- --force overwrites everything

---

## Phase 5: Tower Command (Day 3)

### 5.1 Move from agent-farm

Tower is already implemented in agent-farm. Move it to codev commands:

```typescript
// src/commands/tower.ts
// Import existing tower logic from agent-farm
import { startTower } from '../agent-farm/commands/tower';

export async function tower() {
  await startTower();
}
```

### 5.2 Update Routing

Remove tower from af, add to codev:

```typescript
// src/cli.ts
program
  .command('tower')
  .description('Cross-project dashboard showing all agent-farm instances')
  .action(tower);
```

---

## Phase 6: Templates & Build (Day 4)

### 6.1 Embed codev-skeleton

```bash
# Build script copies skeleton to templates/
cp -r codev-skeleton/* packages/codev/templates/
```

### 6.2 Build Configuration

```json
// packages/codev/package.json
{
  "name": "@cluesmith/codev",
  "version": "1.0.0",
  "bin": {
    "codev": "./bin/codev.js",
    "af": "./bin/af.js"
  },
  "files": [
    "dist",
    "bin",
    "templates"
  ],
  "scripts": {
    "build": "tsc && npm run copy-templates",
    "copy-templates": "cp -r ../codev-skeleton/* templates/",
    "prepublishOnly": "npm run build"
  }
}
```

### 6.3 Test End-to-End

```bash
# Build
npm run build

# Link globally for testing
npm link

# Test all commands
codev doctor
codev init test-project
cd test-project
codev adopt  # Should fail (already has codev)
af start
af status
codev consult --model gemini general "Hello"
codev tower
codev update --dry-run
```

---

## Phase 7: Migration & Deprecation

### 7.1 Deprecation Notice

Add to @cluesmith/agent-farm:

```typescript
console.warn('⚠️  @cluesmith/agent-farm is deprecated. Please use @cluesmith/codev instead.');
console.warn('   npm uninstall -g @cluesmith/agent-farm');
console.warn('   npm install -g @cluesmith/codev');
```

### 7.2 Documentation

- Update README.md with new installation
- Update CLAUDE.md with codev commands
- Add MIGRATION.md for existing users

---

## Testing Checklist

- [ ] `codev doctor` checks all dependencies
- [ ] `codev init my-project` creates valid project
- [ ] `codev adopt` works in existing project
- [ ] `codev update` safely updates files
- [ ] `codev update --dry-run` shows changes
- [ ] `codev tower` shows cross-project view
- [ ] `codev consult --model gemini spec 39` works
- [ ] `codev consult --model codex pr 33` works
- [ ] `consult` alias works (bin/consult.js shim → codev consult)
- [ ] `af start` unchanged
- [ ] `af spawn --project 0039` unchanged
- [ ] `af status` unchanged
- [ ] All existing af commands work
- [ ] npm publish succeeds
- [ ] Global install works: `npm install -g @cluesmith/codev`

---

## Rollback Plan

If issues discovered after publish:

1. Keep @cluesmith/agent-farm available (don't unpublish)
2. Users can: `npm install -g @cluesmith/agent-farm@latest`
3. Fix issues in @cluesmith/codev
4. Re-publish with patch version

---

## Dependencies

- commander (CLI framework)
- chalk (colors)
- ora (spinners)
- execa (process spawning)
- better-sqlite3 (from agent-farm)
- express (from agent-farm)
