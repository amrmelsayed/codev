/**
 * codev doctor - Check system dependencies
 *
 * Port of codev/bin/codev-doctor to TypeScript
 */

import { execSync, spawnSync } from 'node:child_process';
import chalk from 'chalk';

interface Dependency {
  name: string;
  command: string;
  versionArg: string;
  versionExtract: (output: string) => string | null;
  minVersion?: string;
  required: boolean;
  installHint: {
    macos: string;
    linux: string;
  };
}

interface CheckResult {
  status: 'ok' | 'warn' | 'fail' | 'skip';
  version: string;
  note?: string;
}

const isMacOS = process.platform === 'darwin';

/**
 * Compare semantic versions: returns true if v1 >= v2
 */
function versionGte(v1: string, v2: string): boolean {
  const v1Parts = v1.split('.').map(p => parseInt(p.replace(/[^0-9]/g, ''), 10) || 0);
  const v2Parts = v2.split('.').map(p => parseInt(p.replace(/[^0-9]/g, ''), 10) || 0);

  for (let i = 0; i < 3; i++) {
    const p1 = v1Parts[i] || 0;
    const p2 = v2Parts[i] || 0;
    if (p1 > p2) return true;
    if (p1 < p2) return false;
  }
  return true;
}

/**
 * Check if a command exists
 */
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command and get its output
 */
function runCommand(cmd: string, args: string[]): string | null {
  try {
    const result = spawnSync(cmd, args, { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Print status line with color
 */
function printStatus(name: string, result: CheckResult): void {
  const { status, version, note } = result;

  let icon: string;
  let color: typeof chalk;

  switch (status) {
    case 'ok':
      icon = chalk.green('✓');
      color = chalk;
      break;
    case 'warn':
      icon = chalk.yellow('⚠');
      color = chalk;
      break;
    case 'fail':
      icon = chalk.red('✗');
      color = chalk;
      break;
    case 'skip':
      icon = chalk.blue('○');
      color = chalk;
      break;
  }

  let line = `  ${icon} ${name.padEnd(12)} ${version}`;
  if (note) {
    line += chalk.blue(` (${note})`);
  }
  console.log(line);
}

// Core dependencies
const CORE_DEPENDENCIES: Dependency[] = [
  {
    name: 'Node.js',
    command: 'node',
    versionArg: '--version',
    versionExtract: (output) => output.replace(/^v/, ''),
    minVersion: '18.0.0',
    required: true,
    installHint: {
      macos: 'brew install node',
      linux: 'apt install nodejs npm',
    },
  },
  {
    name: 'tmux',
    command: 'tmux',
    versionArg: '-V',
    versionExtract: (output) => output.replace(/^tmux /, '').replace(/[a-z]$/, ''),
    minVersion: '3.0',
    required: true,
    installHint: {
      macos: 'brew install tmux',
      linux: 'apt install tmux',
    },
  },
  {
    name: 'ttyd',
    command: 'ttyd',
    versionArg: '--version',
    versionExtract: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
    minVersion: '1.7.0',
    required: true,
    installHint: {
      macos: 'brew install ttyd',
      linux: 'build from source',
    },
  },
  {
    name: 'git',
    command: 'git',
    versionArg: '--version',
    versionExtract: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
    minVersion: '2.5.0',
    required: true,
    installHint: {
      macos: 'xcode-select --install',
      linux: 'apt install git',
    },
  },
  {
    name: 'gh',
    command: 'gh',
    versionArg: 'auth status',
    versionExtract: () => 'authenticated', // Special case - check auth status
    required: true,
    installHint: {
      macos: 'brew install gh',
      linux: 'apt install gh',
    },
  },
];

// AI CLI dependencies - at least one required
const AI_DEPENDENCIES: Dependency[] = [
  {
    name: 'Claude',
    command: 'claude',
    versionArg: '--version',
    versionExtract: () => 'working',
    required: false,
    installHint: {
      macos: 'npm i -g @anthropic-ai/claude-code',
      linux: 'npm i -g @anthropic-ai/claude-code',
    },
  },
  {
    name: 'Gemini',
    command: 'gemini',
    versionArg: '--version',
    versionExtract: () => 'working',
    required: false,
    installHint: {
      macos: 'see github.com/google-gemini/gemini-cli',
      linux: 'see github.com/google-gemini/gemini-cli',
    },
  },
  {
    name: 'Codex',
    command: 'codex',
    versionArg: '--version',
    versionExtract: () => 'working',
    required: false,
    installHint: {
      macos: 'npm i -g @openai/codex',
      linux: 'npm i -g @openai/codex',
    },
  },
];

/**
 * Check a single dependency
 */
function checkDependency(dep: Dependency): CheckResult {
  if (!commandExists(dep.command)) {
    const hint = isMacOS ? dep.installHint.macos : dep.installHint.linux;
    return {
      status: dep.required ? 'fail' : 'skip',
      version: 'not installed',
      note: hint,
    };
  }

  // Special case for gh auth status
  if (dep.name === 'gh') {
    try {
      execSync('gh auth status', { stdio: 'pipe' });
      return { status: 'ok', version: 'authenticated' };
    } catch {
      return { status: 'warn', version: 'not authenticated', note: 'gh auth login' };
    }
  }

  // Get version
  const output = runCommand(dep.command, dep.versionArg.split(' '));
  if (!output) {
    return {
      status: 'warn',
      version: '(version unknown)',
      note: 'may be incompatible',
    };
  }

  const version = dep.versionExtract(output);
  if (!version) {
    return {
      status: 'warn',
      version: '(version unknown)',
      note: 'may be incompatible',
    };
  }

  // Check minimum version if specified
  if (dep.minVersion) {
    if (versionGte(version, dep.minVersion)) {
      return { status: 'ok', version };
    } else {
      return {
        status: dep.required ? 'fail' : 'warn',
        version,
        note: `need >= ${dep.minVersion}`,
      };
    }
  }

  return { status: 'ok', version };
}

/**
 * Check if npm dependencies are installed
 */
function checkNpmDependencies(): CheckResult {
  try {
    // Check if we're in a directory with a package.json
    const fs = require('node:fs');
    const path = require('node:path');

    // Look for codev package installation
    const globalPath = execSync('npm root -g', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const codevPath = path.join(globalPath, '@cluesmith', 'codev');

    if (fs.existsSync(codevPath)) {
      // Check version
      try {
        const pkgJson = JSON.parse(fs.readFileSync(path.join(codevPath, 'package.json'), 'utf-8'));
        return { status: 'ok', version: pkgJson.version || 'installed' };
      } catch {
        return { status: 'ok', version: 'installed' };
      }
    }

    // Check if af command exists (global install)
    if (commandExists('af')) {
      return { status: 'ok', version: 'installed (via af)' };
    }

    // Check if codev command exists
    if (commandExists('codev')) {
      return { status: 'ok', version: 'installed (via codev)' };
    }

    return {
      status: 'warn',
      version: 'not globally installed',
      note: 'npm i -g @cluesmith/codev',
    };
  } catch {
    return {
      status: 'warn',
      version: 'check failed',
      note: 'npm i -g @cluesmith/codev',
    };
  }
}

/**
 * Main doctor function
 */
export async function doctor(): Promise<number> {
  let errors = 0;
  let warnings = 0;

  console.log(chalk.bold('Codev Doctor') + ' - Checking your environment');
  console.log('============================================');
  console.log('');

  // Check core dependencies
  console.log(chalk.bold('Core Dependencies') + ' (required for Agent Farm)');
  console.log('');

  for (const dep of CORE_DEPENDENCIES) {
    const result = checkDependency(dep);
    printStatus(dep.name, result);
    if (result.status === 'fail') errors++;
    if (result.status === 'warn') warnings++;
  }

  // Check npm package
  const npmResult = checkNpmDependencies();
  printStatus('@cluesmith/codev', npmResult);
  if (npmResult.status === 'warn') warnings++;

  console.log('');

  // Check AI CLI dependencies
  console.log(chalk.bold('AI CLI Dependencies') + ' (at least one required)');
  console.log('');

  let aiCliCount = 0;
  for (const dep of AI_DEPENDENCIES) {
    const result = checkDependency(dep);
    if (result.status === 'ok') {
      aiCliCount++;
    }
    printStatus(dep.name, result);
  }

  if (aiCliCount === 0) {
    console.log('');
    console.log(chalk.red('  ✗') + ' No AI CLI working! Install and configure at least one to use Codev.');
    errors++;
  }

  console.log('');

  // Summary
  console.log('============================================');
  if (errors > 0) {
    console.log(chalk.red.bold('FAILED') + ` - ${errors} required dependency/dependencies missing`);
    console.log('');
    console.log('Install missing dependencies and run this command again.');
    return 1;
  } else if (warnings > 0) {
    console.log(chalk.yellow.bold('OK with warnings') + ` - ${warnings} dependency/dependencies below recommended version`);
    console.log('');
    console.log('Consider upgrading for best experience.');
    return 0;
  } else {
    console.log(chalk.green.bold('ALL OK') + ' - Your environment is ready for Codev!');
    return 0;
  }
}
