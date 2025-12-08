/**
 * codev update - Update codev templates and protocols
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import {
  getTemplatesDir,
  getTemplateFiles,
  hashFile,
  loadHashStore,
  saveHashStore,
  isUserDataPath,
  isUpdatableFile,
} from '../lib/templates.js';

interface UpdateOptions {
  dryRun?: boolean;
  force?: boolean;
}

interface UpdateResult {
  updated: string[];
  skipped: string[];
  conflicts: string[];
  newFiles: string[];
}

/**
 * Update codev templates in current project
 */
export async function update(options: UpdateOptions = {}): Promise<void> {
  const { dryRun = false, force = false } = options;
  const targetDir = process.cwd();
  const codevDir = path.join(targetDir, 'codev');

  // Check if codev exists
  if (!fs.existsSync(codevDir)) {
    throw new Error("No codev/ directory found. Use 'codev init' or 'codev adopt' first.");
  }

  console.log('');
  console.log(chalk.bold('Updating codev templates'));
  if (dryRun) {
    console.log(chalk.yellow('(dry run - no files will be changed)'));
  }
  console.log('');

  const templatesDir = getTemplatesDir();
  const templateFiles = getTemplateFiles(templatesDir);
  const currentHashes = loadHashStore(targetDir);
  const newHashes: Record<string, string> = { ...currentHashes };

  const result: UpdateResult = {
    updated: [],
    skipped: [],
    conflicts: [],
    newFiles: [],
  };

  for (const relativePath of templateFiles) {
    // Skip user data files
    if (isUserDataPath(relativePath)) {
      continue;
    }

    // Only update updatable files (protocols, roles, agents, etc.)
    if (!isUpdatableFile(relativePath)) {
      continue;
    }

    const srcPath = path.join(templatesDir, relativePath);
    const destPath = path.join(codevDir, relativePath);

    // New file - copy it
    if (!fs.existsSync(destPath)) {
      if (!dryRun) {
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(srcPath, destPath);
        newHashes[relativePath] = hashFile(destPath);
      }
      result.newFiles.push(relativePath);
      console.log(chalk.green('  + (new)'), `codev/${relativePath}`);
      continue;
    }

    // File exists - check if it was modified by user
    const currentHash = hashFile(destPath);
    const storedHash = currentHashes[relativePath];
    const newHash = hashFile(srcPath);

    // If the template hasn't changed, skip
    if (currentHash === newHash) {
      result.skipped.push(relativePath);
      continue;
    }

    // If force mode, overwrite everything
    if (force) {
      if (!dryRun) {
        fs.copyFileSync(srcPath, destPath);
        newHashes[relativePath] = hashFile(destPath);
      }
      result.updated.push(relativePath);
      console.log(chalk.blue('  ~ (force)'), `codev/${relativePath}`);
      continue;
    }

    // Check if user modified the file
    const userModified = storedHash && currentHash !== storedHash;

    if (userModified) {
      // User modified the file - write as .codev-new and mark as conflict
      if (!dryRun) {
        fs.copyFileSync(srcPath, destPath + '.codev-new');
      }
      result.conflicts.push(relativePath);
      console.log(chalk.yellow('  ! (conflict)'), `codev/${relativePath}`);
      console.log(chalk.dim('    New version saved as:'), `codev/${relativePath}.codev-new`);
    } else {
      // File unchanged by user - safe to overwrite
      if (!dryRun) {
        fs.copyFileSync(srcPath, destPath);
        newHashes[relativePath] = hashFile(destPath);
      }
      result.updated.push(relativePath);
      console.log(chalk.blue('  ~'), `codev/${relativePath}`);
    }
  }

  // Save updated hash store
  if (!dryRun) {
    saveHashStore(targetDir, newHashes);
  }

  // Summary
  console.log('');
  console.log(chalk.bold('Summary:'));

  if (result.newFiles.length > 0) {
    console.log(chalk.green(`  + ${result.newFiles.length} new files`));
  }
  if (result.updated.length > 0) {
    console.log(chalk.blue(`  ~ ${result.updated.length} updated`));
  }
  if (result.skipped.length > 0) {
    console.log(chalk.dim(`  - ${result.skipped.length} unchanged (skipped)`));
  }
  if (result.conflicts.length > 0) {
    console.log(chalk.yellow(`  ! ${result.conflicts.length} conflicts`));
    console.log('');
    console.log(chalk.yellow('Conflicts detected!'));
    console.log('The following files were modified locally and have new versions available:');
    console.log('');
    for (const file of result.conflicts) {
      console.log(chalk.dim(`  codev/${file}`));
      console.log(chalk.dim(`    → New version: codev/${file}.codev-new`));
    }
    console.log('');
    console.log('Please review and merge manually, then delete the .codev-new files.');
  }

  if (result.newFiles.length === 0 && result.updated.length === 0 && result.conflicts.length === 0) {
    console.log(chalk.dim('  No updates available - already up to date!'));
  }

  if (dryRun) {
    console.log('');
    console.log(chalk.yellow('Dry run complete. Run without --dry-run to apply changes.'));
  }
}
