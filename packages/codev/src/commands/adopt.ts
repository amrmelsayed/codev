/**
 * codev adopt - Add codev to an existing project
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import chalk from 'chalk';
import { getTemplatesDir, copyTemplateDir, saveHashStore } from '../lib/templates.js';

interface AdoptOptions {
  yes?: boolean;
}

interface Conflict {
  file: string;
  type: 'file' | 'directory';
}

/**
 * Prompt for yes/no confirmation
 */
async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const hint = defaultYes ? '[Y/n]' : '[y/N]';
    rl.question(`${question} ${hint}: `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === '') {
        resolve(defaultYes);
      } else {
        resolve(normalized === 'y' || normalized === 'yes');
      }
    });
  });
}

/**
 * Detect conflicts with existing files
 */
function detectConflicts(targetDir: string): Conflict[] {
  const conflicts: Conflict[] = [];

  // Check for codev/ directory
  const codevDir = path.join(targetDir, 'codev');
  if (fs.existsSync(codevDir)) {
    conflicts.push({ file: 'codev/', type: 'directory' });
  }

  // Check for CLAUDE.md
  const claudeMd = path.join(targetDir, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    conflicts.push({ file: 'CLAUDE.md', type: 'file' });
  }

  // Check for AGENTS.md
  const agentsMd = path.join(targetDir, 'AGENTS.md');
  if (fs.existsSync(agentsMd)) {
    conflicts.push({ file: 'AGENTS.md', type: 'file' });
  }

  return conflicts;
}

/**
 * Add codev to an existing project
 */
export async function adopt(options: AdoptOptions = {}): Promise<void> {
  const { yes = false } = options;
  const targetDir = process.cwd();
  const projectName = path.basename(targetDir);

  console.log('');
  console.log(chalk.bold('Adding codev to existing project:'), projectName);
  console.log(chalk.dim('Location:'), targetDir);
  console.log('');

  // Check for codev/ directory - can't adopt if it exists
  const codevDir = path.join(targetDir, 'codev');
  if (fs.existsSync(codevDir)) {
    throw new Error("codev/ directory already exists. Use 'codev update' to update existing installation.");
  }

  // Detect other conflicts
  const conflicts = detectConflicts(targetDir).filter(c => c.file !== 'codev/');

  if (conflicts.length > 0 && !yes) {
    console.log(chalk.yellow('Potential conflicts detected:'));
    console.log('');
    for (const conflict of conflicts) {
      console.log(chalk.yellow('  ⚠'), conflict.file, chalk.dim(`(${conflict.type})`));
    }
    console.log('');

    const proceed = await confirm('Continue and skip conflicting files?', false);
    if (!proceed) {
      console.log(chalk.dim('Aborted.'));
      process.exit(0);
    }
  }

  // Copy templates
  const templatesDir = getTemplatesDir();
  const hashes: Record<string, string> = {};
  let fileCount = 0;
  let skippedCount = 0;

  console.log(chalk.dim('Copying codev structure...'));

  copyTemplateDir(templatesDir, path.join(targetDir, 'codev'), {
    skipExisting: true,
    hashes,
    onFile: (relativePath, action) => {
      if (action === 'copy') {
        fileCount++;
        console.log(chalk.green('  +'), `codev/${relativePath}`);
      } else if (action === 'skip') {
        skippedCount++;
      }
    },
  });

  // Save hash store for future updates
  saveHashStore(targetDir, hashes);

  // Create empty directories for user data
  const userDirs = ['specs', 'plans', 'reviews', 'resources'];
  for (const dir of userDirs) {
    const dirPath = path.join(targetDir, 'codev', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      // Create .gitkeep to preserve empty directory
      fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');
    }
  }

  // Handle CLAUDE.md / AGENTS.md
  const claudeMdSrc = path.join(templatesDir, 'CLAUDE.md');
  const agentsMdSrc = path.join(templatesDir, 'AGENTS.md');

  const claudeMdDest = path.join(targetDir, 'CLAUDE.md');
  const agentsMdDest = path.join(targetDir, 'AGENTS.md');

  // CLAUDE.md
  if (!fs.existsSync(claudeMdDest) && fs.existsSync(claudeMdSrc)) {
    const content = fs.readFileSync(claudeMdSrc, 'utf-8')
      .replace(/\{\{PROJECT_NAME\}\}/g, projectName);
    fs.writeFileSync(claudeMdDest, content);
    console.log(chalk.green('  +'), 'CLAUDE.md');
    fileCount++;
  } else if (fs.existsSync(claudeMdDest)) {
    console.log(chalk.yellow('  ~'), 'CLAUDE.md', chalk.dim('(exists, skipped)'));
    skippedCount++;
  }

  // AGENTS.md
  if (!fs.existsSync(agentsMdDest) && fs.existsSync(agentsMdSrc)) {
    const content = fs.readFileSync(agentsMdSrc, 'utf-8')
      .replace(/\{\{PROJECT_NAME\}\}/g, projectName);
    fs.writeFileSync(agentsMdDest, content);
    console.log(chalk.green('  +'), 'AGENTS.md');
    fileCount++;
  } else if (fs.existsSync(agentsMdDest)) {
    console.log(chalk.yellow('  ~'), 'AGENTS.md', chalk.dim('(exists, skipped)'));
    skippedCount++;
  }

  // Update .gitignore if it exists
  const gitignorePath = path.join(targetDir, '.gitignore');
  const codevGitignoreEntries = `
# Codev
.agent-farm/
.consult/
codev/.update-hashes.json
.builders/
`;

  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, 'utf-8');
    if (!existing.includes('.agent-farm/')) {
      fs.appendFileSync(gitignorePath, codevGitignoreEntries);
      console.log(chalk.green('  ~'), '.gitignore', chalk.dim('(updated)'));
    }
  } else {
    fs.writeFileSync(gitignorePath, codevGitignoreEntries.trim() + '\n');
    console.log(chalk.green('  +'), '.gitignore');
    fileCount++;
  }

  console.log('');
  console.log(chalk.green.bold('✓'), `Created ${fileCount} files`);
  if (skippedCount > 0) {
    console.log(chalk.yellow('  ⚠'), `Skipped ${skippedCount} existing files`);
  }
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log('');
  console.log('  codev doctor           # Check dependencies');
  console.log('  af start               # Start the architect dashboard');
  console.log('');
  console.log(chalk.dim('For more info, see: https://github.com/cluesmith/codev'));
}
