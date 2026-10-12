/**
 * IDE server version handshake and subprocess environment (Spec 1789).
 *
 * Tower refuses to spawn a Codev IDE server older than the floor declared
 * here. The check runs `<server> --version` and reads line 1 only: the VS Code
 * base version (line 2 is the commit, line 3 the arch). The npm package
 * version, which may carry a suffix, is never read.
 *
 * This module is also the single source for the bounds of every server
 * subprocess wait (version check, extension install, readiness, stop), so the
 * CLI's request budget is derived from them and cannot silently desync.
 * `ide-server.ts` imports this module, never the reverse.
 */

import { execFile } from 'node:child_process';
import { delimiter, dirname } from 'node:path';
import { sanitizeAgentEnv } from '../../lib/agent-env.js';

/**
 * Oldest server base version Tower supports. A unit test ties it to the
 * embedded sidebar's `engines.vscode` minimum, so the sidebar is never paired
 * with a server too old to activate it.
 */
export const IDE_SERVER_MIN_VERSION = '1.128.0';

/** Upgrade command named in every refusal. */
export const IDE_SERVER_UPGRADE_COMMAND = 'npm i -g @cluesmith/codev-ide';

/** Bound on `<server> --version`. */
export const IDE_VERSION_TIMEOUT_MS = 10_000;
/** Bound on `<server> --install-extension` (a cold install takes ~2 s; this is for a wedged server). */
export const IDE_INSTALL_TIMEOUT_MS = 60_000;
/** Bound on waiting for a spawned server to listen on its port. */
export const IDE_READY_TIMEOUT_MS = 15_000;
/** Bound on waiting for a stopped server to exit before escalating to SIGKILL. */
export const IDE_STOP_EXIT_TIMEOUT_MS = 5_000;
/** Fixed slack on top of the start budget for request and lock overhead. */
const IDE_START_BUDGET_MARGIN_MS = 10_000;

/**
 * Longest a client should wait for an IDE start or stop: one full start
 * (version check, install, stopping a server on another port, readiness)
 * doubled for one queued operation's worth of lock wait, plus margin.
 */
export const IDE_START_BUDGET_MS =
  (IDE_VERSION_TIMEOUT_MS + IDE_INSTALL_TIMEOUT_MS + IDE_STOP_EXIT_TIMEOUT_MS + IDE_READY_TIMEOUT_MS) * 2 +
  IDE_START_BUDGET_MARGIN_MS;

const STRICT_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parse the base version from `--version` output: line 1 only, trimmed, strict
 * `major.minor.patch`. Anything else on line 1, including a prerelease suffix,
 * is unparseable and yields null.
 */
export function parseIdeServerVersion(stdout: string): string | null {
  const firstLine = stdout.split(/\r?\n/, 1)[0].trim();
  if (!STRICT_VERSION.test(firstLine)) return null;
  return firstLine;
}

/** Numeric compare of two strict `major.minor.patch` versions: negative, zero or positive. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Environment for every IDE server subprocess: the sanitized agent env with
 * the directory of the Node running Tower prepended to `PATH`. The npm
 * `codev-ide-server` launcher is a `#!/usr/bin/env node` script, and Tower
 * may run under a daemon whose `PATH` lacks a Node.
 */
export function buildIdeServerEnv(baseEnv: NodeJS.ProcessEnv | Record<string, string> = process.env): Record<string, string> {
  const env = sanitizeAgentEnv(baseEnv);
  const nodeDir = dirname(process.execPath);
  const entries = (env.PATH ?? '').split(delimiter).filter((entry) => entry !== '');
  if (!entries.includes(nodeDir)) {
    entries.unshift(nodeDir);
  }
  env.PATH = entries.join(delimiter);
  return env;
}

/** Thrown when the server's version is below the floor or cannot be determined. */
export class IdeServerVersionError extends Error {
  constructor(detail: string) {
    super(
      `${detail}. Codev requires Codev IDE server ${IDE_SERVER_MIN_VERSION} or newer; ` +
        `upgrade with: ${IDE_SERVER_UPGRADE_COMMAND}`,
    );
    this.name = 'IdeServerVersionError';
  }
}

export interface CheckIdeServerVersionOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
}

interface VersionRun {
  stdout: string;
  stderr: string;
}

function runVersion(serverPath: string, timeoutMs: number, env: Record<string, string>): Promise<VersionRun> {
  return new Promise((resolve, reject) => {
    execFile(serverPath, ['--version'], { timeout: timeoutMs, env }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout: String(stdout), stderr: String(stderr) }));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function describeRunFailure(serverPath: string, error: unknown, timeoutMs: number): string {
  const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null; stderr?: string };
  if (err.killed) {
    return `IDE server at ${serverPath} did not answer --version within ${timeoutMs / 1000}s`;
  }
  const stderr = (err.stderr ?? '').trim();
  let detail = `IDE server at ${serverPath} failed to run --version (${err.message.split('\n', 1)[0]})`;
  if (stderr !== '') {
    detail = `${detail}: ${stderr}`;
  }
  return detail;
}

/**
 * Run `<serverPath> --version` and check it against the floor. Resolves with
 * the parsed base version, or throws an `IdeServerVersionError` naming the
 * installed version (or the failure), the floor and the upgrade command.
 */
export async function checkIdeServerVersion(
  serverPath: string,
  opts: CheckIdeServerVersionOptions = {},
): Promise<{ version: string }> {
  const timeoutMs = opts.timeoutMs ?? IDE_VERSION_TIMEOUT_MS;
  const env = opts.env ?? buildIdeServerEnv();

  let run: VersionRun;
  try {
    run = await runVersion(serverPath, timeoutMs, env);
  } catch (error) {
    throw new IdeServerVersionError(describeRunFailure(serverPath, error, timeoutMs));
  }

  const version = parseIdeServerVersion(run.stdout);
  if (version === null) {
    const firstLine = run.stdout.split(/\r?\n/, 1)[0].trim();
    throw new IdeServerVersionError(
      `IDE server at ${serverPath} printed an unrecognized version (${JSON.stringify(firstLine)})`,
    );
  }
  if (compareVersions(version, IDE_SERVER_MIN_VERSION) < 0) {
    throw new IdeServerVersionError(`IDE server at ${serverPath} is version ${version}, below the supported floor`);
  }
  return { version };
}
