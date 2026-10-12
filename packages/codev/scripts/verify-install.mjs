#!/usr/bin/env node

/**
 * Post-release install verification script.
 *
 * Installs the package from a tarball or npm registry, then verifies
 * all CLI binaries exist and respond to --help, and that the embedded
 * sidebar vsix ships with its manifest (Spec 1789).
 *
 * Usage:
 *   node scripts/verify-install.mjs <tarball-or-package> [...extra-tarballs]
 *
 * Examples:
 *   node scripts/verify-install.mjs ./cluesmith-codev-2.0.0.tgz ../core/cluesmith-codev-core-0.0.1.tgz
 *   node scripts/verify-install.mjs @cluesmith/codev@2.0.0
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node scripts/verify-install.mjs <tarball-or-package> [...extra-tarballs]');
  process.exit(1);
}
const prefix = mkdtempSync(join(tmpdir(), 'codev-install-verify-'));
let failed = false;

try {
  const quoted = targets.map(t => `"${t}"`).join(' ');
  console.log(`Installing ${targets.join(', ')} into ${prefix}...`);
  execSync(`npm install -g --prefix "${prefix}" ${quoted}`, { stdio: 'inherit' });

  const bins = ['codev', 'afx', 'porch', 'consult'];
  for (const bin of bins) {
    try {
      execSync(`"${join(prefix, 'bin', bin)}" --help`, { stdio: 'pipe' });
      console.log(`  OK: ${bin} --help`);
    } catch (err) {
      console.error(`  FAIL: ${bin} --help (exit code ${err.status})`);
      failed = true;
    }
  }

  const globalRoot = execSync(`npm root -g --prefix "${prefix}"`, { encoding: 'utf8' }).trim();
  const installedPkgDir = join(globalRoot, '@cluesmith', 'codev');
  const installedVersion = JSON.parse(readFileSync(join(installedPkgDir, 'package.json'), 'utf8')).version;
  const vsixPath = join(installedPkgDir, 'ide-extension', 'codev-vscode.vsix');
  const manifestPath = join(installedPkgDir, 'ide-extension', 'manifest.json');
  if (existsSync(vsixPath)) {
    console.log('  OK: ide-extension/codev-vscode.vsix present');
  } else {
    console.error(`  FAIL: embedded sidebar vsix missing at ${vsixPath}`);
    failed = true;
  }
  // Stable releases ship the sidebar at the package's own version. Pre-releases
  // (e.g. 3.4.0-rc.1) do not bump apps/vscode (the Marketplace rejects semver
  // pre-release suffixes), so they embed the last stable sidebar instead.
  const isPrerelease = installedVersion.includes('-');
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.id !== 'cluesmith.codev-vscode' || typeof manifest.version !== 'string') {
      console.error(`  FAIL: ide-extension/manifest.json is malformed (${JSON.stringify(manifest)})`);
      failed = true;
    } else if (isPrerelease || manifest.version === installedVersion) {
      console.log(`  OK: ide-extension/manifest.json version ${manifest.version}`);
    } else {
      console.error(`  FAIL: embedded sidebar version ${manifest.version} != package version ${installedVersion}`);
      failed = true;
    }
  } catch (err) {
    console.error(`  FAIL: cannot read ide-extension/manifest.json (${err.message})`);
    failed = true;
  }

  if (failed) {
    console.error('\nInstall verification FAILED.');
    process.exit(1);
  }

  console.log('\nInstall verification passed.');
} finally {
  rmSync(prefix, { recursive: true, force: true });
}
