/**
 * reset command - Reset an Stoneforge workspace
 *
 * Performs a complete workspace reset:
 * - Stops any running daemon
 * - Removes .stoneforge/stoneforge.db (and related db files)
 * - Cleans up .stoneforge/.worktrees/ directory
 * - Runs git worktree prune
 */

import * as readline from 'node:readline';
import { existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';

// ============================================================================
// Constants
// ============================================================================

const STONEFORGE_DIR = '.stoneforge';
const WORKTREES_DIR = '.stoneforge/.worktrees';
const DEFAULT_SMITHY_URL = 'http://localhost:3457';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Prompts user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Attempts to stop the daemon via the server API
 */
async function tryStopDaemon(serverUrl: string): Promise<{ stopped: boolean; error?: string }> {
  try {
    const response = await fetch(`${serverUrl}/api/daemon/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      return { stopped: true };
    }

    // Try to parse error response, but don't fail if it's not valid JSON
    try {
      const data = await response.json();
      return { stopped: false, error: data.error?.message ?? `Server returned ${response.status}` };
    } catch {
      return { stopped: false, error: `Server returned ${response.status}` };
    }
  } catch (err) {
    // Server not running or connection refused - that's fine
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { stopped: false }; // Not an error, server just isn't running
    }
    return { stopped: false, error: message };
  }
}

/**
 * Removes database and data files from .stoneforge directory
 */
function removeDataFiles(stoneforgeDir: string): { removed: string[] } {
  const removed: string[] = [];

  if (!existsSync(stoneforgeDir)) {
    return { removed };
  }

  // Database files and root-level sync files
  const filesToRemove = [
    'stoneforge.db',
    'stoneforge.db-journal',
    'stoneforge.db-wal',
    'stoneforge.db-shm',
    // Sync/export files (root level, legacy location)
    'elements.jsonl',
    'dependencies.jsonl',
  ];

  for (const filename of filesToRemove) {
    const filePath = join(stoneforgeDir, filename);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
      removed.push(filename);
    }
  }

  // Clear sync directory files
  const syncDir = join(stoneforgeDir, 'sync');
  if (existsSync(syncDir)) {
    const syncFiles = ['elements.jsonl', 'dependencies.jsonl'];
    for (const filename of syncFiles) {
      const filePath = join(syncDir, filename);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
        removed.push(`sync/${filename}`);
      }
    }
  }

  // Clear uploads directory
  const uploadsDir = join(stoneforgeDir, 'uploads');
  if (existsSync(uploadsDir)) {
    try {
      const files = readdirSync(uploadsDir);
      for (const file of files) {
        const filePath = join(uploadsDir, file);
        rmSync(filePath, { recursive: true, force: true });
        removed.push(`uploads/${file}`);
      }
    } catch {
      // Ignore errors reading uploads directory
    }
  }

  return { removed };
}

/**
 * Removes .stoneforge/.worktrees directory and prunes git worktrees
 */
function cleanupWorktrees(workDir: string): { removed: boolean; pruned: boolean; error?: string } {
  const worktreesDir = join(workDir, WORKTREES_DIR);
  let removed = false;
  let pruned = false;

  // Remove .stoneforge/.worktrees directory
  if (existsSync(worktreesDir)) {
    try {
      rmSync(worktreesDir, { recursive: true, force: true });
      removed = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { removed: false, pruned: false, error: t('reset.error.failedRemoveWorktrees', { dir: WORKTREES_DIR, message }) };
    }
  }

  // Run git worktree prune
  try {
    execSync('git worktree prune', { cwd: workDir, stdio: 'pipe' });
    pruned = true;
  } catch (err) {
    // Git worktree prune might fail if not in a git repo - that's okay
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('not a git repository')) {
      return { removed, pruned: false, error: t('reset.error.failedPrune', { message }) };
    }
  }

  return { removed, pruned };
}

// ============================================================================
// Command Options
// ============================================================================

interface ResetOptions {
  force?: boolean;
  full?: boolean;
  server?: string;
}

// ============================================================================
// Handler
// ============================================================================

async function resetHandler(
  _args: string[],
  options: GlobalOptions & ResetOptions
): Promise<CommandResult> {
  const workDir = process.cwd();
  const stoneforgeDir = join(workDir, STONEFORGE_DIR);

  // Check if workspace exists
  if (!existsSync(stoneforgeDir)) {
    return failure(
      t('reset.error.noWorkspace', { path: stoneforgeDir }),
      ExitCode.VALIDATION
    );
  }

  const isFull = options.full ?? false;

  // Confirm unless --force
  if (!options.force) {
    if (isFull) {
      console.log(t('reset.confirm.fullHeader'));
      console.log('  - ' + t('reset.confirm.stopDaemon'));
      console.log('  - ' + t('reset.confirm.deleteFolder'));
      console.log('  - ' + t('reset.confirm.removeWorktrees'));
      console.log('  - ' + t('reset.confirm.pruneWorktrees'));
      console.log('  - ' + t('reset.confirm.reinitialize'));
    } else {
      console.log(t('reset.confirm.header'));
      console.log('  - ' + t('reset.confirm.stopDaemon'));
      console.log('  - ' + t('reset.confirm.removeDatabase'));
      console.log('  - ' + t('reset.confirm.removeSyncFiles'));
      console.log('  - ' + t('reset.confirm.removeUploads'));
      console.log('  - ' + t('reset.confirm.removeWorktrees'));
      console.log('  - ' + t('reset.confirm.pruneWorktrees'));
      console.log('');
      console.log(t('reset.confirm.preserveConfig'));
    }
    console.log('');

    const confirmed = await confirm(t('reset.confirm.prompt'));
    if (!confirmed) {
      return success(null, t('reset.success.cancelled'));
    }
  }

  const results: string[] = [];

  // 1. Stop daemon
  const serverUrl = options.server ?? process.env.ORCHESTRATOR_URL ?? DEFAULT_SMITHY_URL;
  const daemonResult = await tryStopDaemon(serverUrl);
  if (daemonResult.stopped) {
    results.push(t('reset.success.stoppedDaemon'));
  } else if (daemonResult.error) {
    results.push(t('reset.warning.couldNotStopDaemon', { error: daemonResult.error }));
  }

  if (isFull) {
    // Full reset: delete entire .stoneforge folder
    try {
      rmSync(stoneforgeDir, { recursive: true, force: true });
      results.push(t('reset.success.deletedFolder'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(t('reset.error.failedDeleteFolder', { message }), ExitCode.GENERAL_ERROR);
    }
  } else {
    // Partial reset: remove only data files
    const dataResult = removeDataFiles(stoneforgeDir);
    if (dataResult.removed.length > 0) {
      results.push(t('reset.success.removedDataFiles', { files: dataResult.removed.join(', ') }));
    }
  }

  // 3. Cleanup worktrees
  const worktreeResult = cleanupWorktrees(workDir);
  if (worktreeResult.error) {
    return failure(worktreeResult.error, ExitCode.GENERAL_ERROR);
  }
  if (worktreeResult.removed) {
    results.push(t('reset.success.removedWorktrees'));
  }
  if (worktreeResult.pruned) {
    results.push(t('reset.success.prunedWorktrees'));
  }

  // 4. If full reset, reinitialize
  if (isFull) {
    const { initCommand } = await import('./init.js');
    const initResult = await initCommand.handler([], options);
    if (initResult.error) {
      return failure(t('reset.error.initFailed', { message: initResult.message }), ExitCode.GENERAL_ERROR);
    }
    results.push(t('reset.success.reinitialized'));
  }

  // Summary
  const summary = results.length > 0
    ? t('reset.success.complete', { details: results.join('\n  ') })
    : t('reset.success.completeNothing');

  return success(
    {
      full: isFull,
      worktreesRemoved: worktreeResult.removed,
      gitPruned: worktreeResult.pruned,
      daemonStopped: daemonResult.stopped,
    },
    summary
  );
}

// ============================================================================
// Command Definition
// ============================================================================

export const resetCommand: Command = {
  name: 'reset',
  description: t('reset.description'),
  usage: 'sf reset [--force] [--full]',
  help: t('reset.help'),
  options: [
    {
      name: 'force',
      short: 'f',
      description: t('reset.option.force'),
    },
    {
      name: 'full',
      description: t('reset.option.full'),
    },
    {
      name: 'server',
      short: 's',
      description: t('reset.option.server', { default: DEFAULT_SMITHY_URL }),
      hasValue: true,
    },
  ],
  handler: resetHandler as Command['handler'],
};
