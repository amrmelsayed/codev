/**
 * Stop command - stops all agent farm processes
 */

import { loadState, clearState } from '../state.js';
import { logger } from '../utils/logger.js';
import { killProcess, isProcessRunning, run } from '../utils/shell.js';
import { getConfig } from '../utils/config.js';

/**
 * Find orphan agent-farm processes for this project that aren't in state
 * Returns PIDs of orphaned processes
 */
async function findOrphanProcesses(trackedPids: Set<number>): Promise<number[]> {
  const config = getConfig();
  const projectRoot = config.projectRoot;

  // Pattern to match agent-farm server processes for this project
  // Matches: node .../dist/agent-farm/servers/dashboard-server.js
  //          node .../dist/agent-farm/servers/open-server.js
  //          node .../dist/agent-farm/servers/tower-server.js
  const orphans: number[] = [];

  try {
    // Use ps to find node processes, then filter by our project path
    const result = await run('ps -eo pid,command');
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      // Skip if doesn't contain our project path and agent-farm servers
      if (!line.includes(projectRoot) || !line.includes('agent-farm/servers/')) {
        continue;
      }

      // Extract PID (first number in the line)
      const match = line.trim().match(/^(\d+)/);
      if (!match) continue;

      const pid = parseInt(match[1], 10);

      // Skip if this PID is tracked in state
      if (trackedPids.has(pid)) {
        continue;
      }

      // This is an orphan
      orphans.push(pid);
    }
  } catch {
    // ps command failed - ignore
  }

  return orphans;
}

/**
 * Stop all agent farm processes
 */
export async function stop(): Promise<void> {
  const state = loadState();

  logger.header('Stopping Agent Farm');

  let stopped = 0;

  // Collect all tracked PIDs for orphan detection
  const trackedPids = new Set<number>();
  if (state.architect) trackedPids.add(state.architect.pid);
  for (const builder of state.builders) trackedPids.add(builder.pid);
  for (const util of state.utils) trackedPids.add(util.pid);
  for (const annotation of state.annotations) trackedPids.add(annotation.pid);

  // Stop architect
  if (state.architect) {
    logger.info(`Stopping architect (PID: ${state.architect.pid})`);
    try {
      if (await isProcessRunning(state.architect.pid)) {
        await killProcess(state.architect.pid);
        stopped++;
      }
    } catch (error) {
      logger.warn(`Failed to stop architect: ${error}`);
    }
  }

  // Stop all builders
  for (const builder of state.builders) {
    logger.info(`Stopping builder ${builder.id} (PID: ${builder.pid})`);
    try {
      if (await isProcessRunning(builder.pid)) {
        await killProcess(builder.pid);
        stopped++;
      }
    } catch (error) {
      logger.warn(`Failed to stop builder ${builder.id}: ${error}`);
    }
  }

  // Stop all utils
  for (const util of state.utils) {
    logger.info(`Stopping util ${util.id} (PID: ${util.pid})`);
    try {
      if (await isProcessRunning(util.pid)) {
        await killProcess(util.pid);
        stopped++;
      }
    } catch (error) {
      logger.warn(`Failed to stop util ${util.id}: ${error}`);
    }
  }

  // Stop all annotations
  for (const annotation of state.annotations) {
    logger.info(`Stopping annotation ${annotation.id} (PID: ${annotation.pid})`);
    try {
      if (await isProcessRunning(annotation.pid)) {
        await killProcess(annotation.pid);
        stopped++;
      }
    } catch (error) {
      logger.warn(`Failed to stop annotation ${annotation.id}: ${error}`);
    }
  }

  // Clear state
  clearState();

  // Find and kill orphan processes (not in state but running for this project)
  const orphans = await findOrphanProcesses(trackedPids);
  if (orphans.length > 0) {
    logger.blank();
    logger.info(`Found ${orphans.length} orphan process(es)`);
    for (const pid of orphans) {
      try {
        if (await isProcessRunning(pid)) {
          logger.info(`  Killing orphan PID ${pid}`);
          await killProcess(pid);
          stopped++;
        }
      } catch (error) {
        logger.warn(`  Failed to kill orphan ${pid}: ${error}`);
      }
    }
  }

  logger.blank();
  if (stopped > 0) {
    logger.success(`Stopped ${stopped} process(es)`);
  } else {
    logger.info('No processes were running');
  }
}
