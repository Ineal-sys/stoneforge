/**
 * Merge Command - CLI command for squash-merging a branch into the default branch
 *
 * Used by persistent workers and docs stewards to merge their work:
 * - sf merge                          -- squash-merge current branch into master
 * - sf merge --branch feature/xyz     -- squash-merge a specific branch
 * - sf merge --cleanup                -- also delete source branch and worktree
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getOutputMode } from '@stoneforge/quarry/cli';
import { detectTargetBranch } from '../../git/merge.js';
import { t } from '../i18n/index.js';

// ============================================================================
// Types
// ============================================================================

interface MergeOptions {
  branch?: string;
  into?: string;
  message?: string;
  cleanup?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

async function execAsync(
  cmd: string,
  options: { cwd?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execPromise = promisify(exec);
  return execPromise(cmd, { ...options, encoding: 'utf8', timeout: 120_000 });
}

async function detectCurrentBranch(cwd?: string): Promise<string> {
  const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });
  return stdout.trim();
}

async function detectDefaultBranch(cwd?: string): Promise<string> {
  // Delegate to the canonical detectTargetBranch() for consistent detection
  return detectTargetBranch(cwd ?? process.cwd());
}

// ============================================================================
// Merge Command Handler
// ============================================================================

const mergeOptions: CommandOption[] = [
  {
    name: 'branch',
    short: 'b',
    description: t('merge.option.branch'),
    hasValue: true,
  },
  {
    name: 'into',
    short: 'i',
    description: t('merge.option.into'),
    hasValue: true,
  },
  {
    name: 'message',
    short: 'm',
    description: t('merge.option.message'),
    hasValue: true,
  },
  {
    name: 'cleanup',
    description: t('merge.option.cleanup'),
  },
];

async function mergeHandler(
  _args: string[],
  options: GlobalOptions & MergeOptions
): Promise<CommandResult> {
  const cwd = process.cwd();

  try {
    // Determine source branch
    const sourceBranch = options.branch ?? await detectCurrentBranch(cwd);
    const targetBranch = options.into ?? await detectDefaultBranch(cwd);
    const commitMessage = options.message ?? `Merge ${sourceBranch}`;

    if (sourceBranch === targetBranch) {
      return failure(
        t('merge.sameBranch', { source: sourceBranch, target: targetBranch }),
        ExitCode.INVALID_ARGUMENTS
      );
    }

    // 1. Fetch latest from origin
    await execAsync('git fetch origin', { cwd });

    // 2. Create a temporary merge worktree at target branch
    const path = await import('node:path');
    const mergeDirName = `_merge-${Date.now()}`;

    // Find workspace root by looking for .stoneforge or .git
    let workspaceRoot = cwd;
    const fs = await import('node:fs');
    while (workspaceRoot !== '/') {
      if (
        fs.existsSync(path.join(workspaceRoot, '.stoneforge')) ||
        fs.existsSync(path.join(workspaceRoot, '.git'))
      ) {
        break;
      }
      workspaceRoot = path.dirname(workspaceRoot);
    }

    const mergeDir = path.join(workspaceRoot, '.stoneforge/.worktrees', mergeDirName);

    try {
      await execAsync(
        `git worktree add --detach "${mergeDir}" origin/${targetBranch}`,
        { cwd: workspaceRoot }
      );

      // 3. Squash merge source branch
      await execAsync(`git merge --squash ${sourceBranch}`, { cwd: mergeDir });

      // 4. Commit
      const escapedMessage = commitMessage.replace(/"/g, '\\"');
      await execAsync(`git commit -m "${escapedMessage}"`, { cwd: mergeDir });

      // 5. Get commit hash
      const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: mergeDir,
      });
      const commitHash = hashOutput.trim();

      // 6. Push to origin
      await execAsync(`git push origin HEAD:${targetBranch}`, { cwd: mergeDir });

      // 7. Remove temp merge worktree
      await execAsync(`git worktree remove --force "${mergeDir}"`, {
        cwd: workspaceRoot,
      });

      // 8. Cleanup if requested
      if (options.cleanup) {
        // Find and remove the source worktree (the cwd if it's a worktree)
        try {
          // Try to remove the current worktree
          const { stdout: worktreeList } = await execAsync('git worktree list --porcelain', {
            cwd: workspaceRoot,
          });

          // Find worktree entry matching cwd
          const entries = worktreeList.split('\n\n');
          for (const entry of entries) {
            const lines = entry.split('\n');
            const worktreeLine = lines.find(l => l.startsWith('worktree '));
            if (worktreeLine) {
              const wtPath = worktreeLine.replace('worktree ', '');
              if (wtPath === cwd || cwd.startsWith(wtPath + '/')) {
                // Don't remove the main worktree
                const isBare = lines.some(l => l === 'bare');
                const branchLine = lines.find(l => l.startsWith('branch '));
                if (!isBare && branchLine) {
                  await execAsync(`git worktree remove --force "${wtPath}"`, {
                    cwd: workspaceRoot,
                  });
                }
                break;
              }
            }
          }
        } catch {
          // Ignore worktree removal errors
        }

        // Delete source branch locally and remotely
        try {
          await execAsync(`git branch -D ${sourceBranch}`, { cwd: workspaceRoot });
        } catch {
          // Branch may not exist locally
        }
        try {
          await execAsync(`git push origin --delete ${sourceBranch}`, {
            cwd: workspaceRoot,
          });
        } catch {
          // Branch may not exist on remote
        }
      }

      const mode = getOutputMode(options);

      if (mode === 'json') {
        return success({
          sourceBranch,
          targetBranch,
          commitHash,
          commitMessage,
          cleanup: options.cleanup ?? false,
        });
      }

      if (mode === 'quiet') {
        return success(commitHash);
      }

      const lines = [
        t('merge.success', { source: sourceBranch, target: targetBranch }),
        `  Commit: ${commitHash.slice(0, 8)}`,
        `  Message: ${commitMessage}`,
      ];
      if (options.cleanup) {
        lines.push('  ' + t('merge.cleanup'));
      }

      return success(
        { sourceBranch, targetBranch, commitHash, commitMessage },
        lines.join('\n')
      );
    } catch (error) {
      // Cleanup merge worktree on failure
      try {
        await execAsync(`git worktree remove --force "${mergeDir}"`, {
          cwd: workspaceRoot,
        });
      } catch {
        // Ignore cleanup errors
      }

      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg.includes('CONFLICT') || errorMsg.includes('Automatic merge failed')) {
        return failure(
          t('merge.conflict', { source: sourceBranch, target: targetBranch }),
          ExitCode.GENERAL_ERROR
        );
      }

      throw error;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('merge.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Export
// ============================================================================

export const mergeCommand: Command = {
  name: 'merge',
  description: t('merge.description'),
  usage: 'sf merge [options]',
  help: t('merge.help'),
  options: mergeOptions,
  handler: mergeHandler as Command['handler'],
};
