/**
 * Stats Command - Show system statistics
 *
 * Displays various statistics about the Stoneforge workspace.
 */

import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import type { QuarryAPI } from '../../api/types.js';
import { createAPI } from '../db.js';
import { t } from '../i18n/index.js';

// ============================================================================
// Stats Handler
// ============================================================================

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function statsHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const stats = await api.stats();

    // Build human-readable output
    const lines: string[] = [];

    lines.push(t('stats.label.workspaceStats'));
    lines.push('');

    // Element counts
    lines.push(t('stats.label.elements'));
    lines.push(`  ${t('stats.label.total')}: ${stats.totalElements}`);
    for (const [type, count] of Object.entries(stats.elementsByType)) {
      if (count > 0) {
        lines.push(`  ${type}: ${count}`);
      }
    }
    lines.push('');

    // Task status
    lines.push(t('stats.label.tasks'));
    lines.push(`  ${t('stats.label.ready')}: ${stats.readyTasks}`);
    lines.push(`  ${t('stats.label.blocked')}: ${stats.blockedTasks}`);
    lines.push('');

    // Dependencies and events
    lines.push(t('stats.label.relations'));
    lines.push(`  ${t('stats.label.dependencies')}: ${stats.totalDependencies}`);
    lines.push(`  ${t('stats.label.events')}: ${stats.totalEvents}`);
    lines.push('');

    // Database size
    lines.push(t('stats.label.storage'));
    lines.push(`  ${t('stats.label.dbSize')}: ${formatBytes(stats.databaseSize)}`);

    return success(stats, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('stats.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const statsCommand: Command = {
  name: 'stats',
  description: t('stats.description'),
  usage: 'sf stats',
  help: t('stats.help'),
  handler: statsHandler,
};
