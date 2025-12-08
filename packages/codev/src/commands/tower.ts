/**
 * codev tower - Cross-project dashboard
 *
 * Shows all running agent-farm instances across projects.
 * This is a framework-level command (not project-level like af).
 */

interface TowerOptions {
  port?: number;
  stop?: boolean;
}

/**
 * Start or stop the tower dashboard
 */
export async function tower(options: TowerOptions = {}): Promise<void> {
  // Import dynamically to avoid circular dependency with agent-farm
  const { towerStart, towerStop } = await import('../agent-farm/commands/tower.js');

  const port = options.port ?? 4100;

  if (options.stop) {
    await towerStop({ port });
  } else {
    await towerStart({ port });
  }
}
