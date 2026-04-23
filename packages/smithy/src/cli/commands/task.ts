/**
 * Task Commands - CLI operations for orchestrator task management
 *
 * Provides commands for task management:
 * - task handoff <task-id>: Hand off a task to another agent
 * - task complete <task-id>: Complete a task and optionally create a PR
 * - task merge <task-id>: Mark a task as merged and close it
 * - task reject <task-id>: Mark a task merge as failed and reopen it
 * - task sync <task-id>: Sync a task branch with the main branch
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getOutputMode } from '@stoneforge/quarry/cli';
import type { ElementId, Task } from '@stoneforge/core';
import { TaskStatus, createTimestamp } from '@stoneforge/core';
import { t } from '../i18n/index.js';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates task assignment service
 */
async function createTaskAssignmentService(options: GlobalOptions): Promise<{
  service: import('../../services/task-assignment-service.js').TaskAssignmentService | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createTaskAssignmentService: createService } = await import('../../services/task-assignment-service.js');
    const { createLocalMergeProvider } = await import('../../services/merge-request-provider.js');
    const { QuarryAPIImpl } = await import('@stoneforge/quarry');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return {
        service: null,
        error: t('task.noStoneforge'),
      };
    }

    const dbPath = options.db ?? `${stoneforgeDir}/stoneforge.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = new QuarryAPIImpl(backend);
    const mergeProvider = createLocalMergeProvider();
    const { dirname } = await import('node:path');
    const workspaceRoot = dirname(stoneforgeDir);
    const service = createService(api, mergeProvider, workspaceRoot);

    return { service };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { service: null, error: t('task.serviceInitFailed', { message }) };
  }
}

/**
 * Creates an OrchestratorAPI instance for merge/reject operations
 */
async function createOrchestratorApi(options: GlobalOptions): Promise<{
  api: import('../../api/orchestrator-api.js').OrchestratorAPI | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createOrchestratorAPI } = await import('../../api/orchestrator-api.js');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return {
        api: null,
        error: t('task.noStoneforge'),
      };
    }

    const dbPath = options.db ?? `${stoneforgeDir}/stoneforge.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createOrchestratorAPI(backend);

    return { api };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { api: null, error: t('task.apiInitFailed', { message }) };
  }
}

/**
 * Gets the current session ID from environment or generates a placeholder
 */
function getCurrentSessionId(): string {
  // Check for session ID in environment (set by spawner or agent)
  return process.env.STONEFORGE_SESSION_ID || `cli-${Date.now()}`;
}

// ============================================================================
// Task Handoff Command
// ============================================================================

interface TaskHandoffOptions {
  message?: string;
  branch?: string;
  worktree?: string;
  sessionId?: string;
}

const taskHandoffOptions: CommandOption[] = [
  {
    name: 'message',
    short: 'm',
    description: t('task.handoff.option.message'),
    hasValue: true,
  },
  {
    name: 'branch',
    short: 'b',
    description: t('task.handoff.option.branch'),
    hasValue: true,
  },
  {
    name: 'worktree',
    short: 'w',
    description: t('task.handoff.option.worktree'),
    hasValue: true,
  },
  {
    name: 'sessionId',
    short: 's',
    description: t('task.handoff.option.sessionId'),
    hasValue: true,
  },
];

async function taskHandoffHandler(
  args: string[],
  options: GlobalOptions & TaskHandoffOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure(t('task.handoff.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { service, error } = await createTaskAssignmentService(options);
  if (error || !service) {
    return failure(error ?? t('shared.failedToCreateService'), ExitCode.GENERAL_ERROR);
  }

  try {
    const sessionId = options.sessionId || getCurrentSessionId();

    const task = await service.handoffTask(taskId as ElementId, {
      sessionId,
      message: options.message,
      branch: options.branch,
      worktree: options.worktree,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: task.id,
        sessionId,
        message: options.message,
        branch: options.branch,
        worktree: options.worktree,
        handedOff: true,
      });
    }

    if (mode === 'quiet') {
      return success(task.id);
    }

    const lines = [
      t('task.handoff.success', { taskId }),
      `  Session:   ${sessionId}`,
    ];
    if (options.message) {
      lines.push(`  Message:   ${options.message.slice(0, 50)}${options.message.length > 50 ? '...' : ''}`);
    }
    if (options.branch) {
      lines.push(`  Branch:    ${options.branch}`);
    }
    if (options.worktree) {
      lines.push(`  Worktree:  ${options.worktree}`);
    }
    lines.push('');
    lines.push(t('task.handoff.availableForPickup'));

    return success(task, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('task.handoff.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const taskHandoffCommand: Command = {
  name: 'handoff',
  description: t('task.handoff.description'),
  usage: 'sf task handoff <task-id> [options]',
  help: t('task.handoff.help'),
  options: taskHandoffOptions,
  handler: taskHandoffHandler as Command['handler'],
};

// ============================================================================
// Task Complete Command
// ============================================================================

interface TaskCompleteOptions {
  summary?: string;
  commitHash?: string;
  noMR?: boolean;
  mrTitle?: string;
  mrBody?: string;
  baseBranch?: string;
}

const taskCompleteOptions: CommandOption[] = [
  {
    name: 'summary',
    short: 's',
    description: t('task.complete.option.summary'),
    hasValue: true,
  },
  {
    name: 'commitHash',
    short: 'c',
    description: t('task.complete.option.commitHash'),
    hasValue: true,
  },
  {
    name: 'no-mr',
    description: t('task.complete.option.noMr'),
  },
  {
    name: 'mr-title',
    description: t('task.complete.option.mrTitle'),
    hasValue: true,
  },
  {
    name: 'mr-body',
    description: t('task.complete.option.mrBody'),
    hasValue: true,
  },
  {
    name: 'baseBranch',
    short: 'b',
    description: t('task.complete.option.baseBranch'),
    hasValue: true,
  },
];

async function taskCompleteHandler(
  args: string[],
  options: GlobalOptions & TaskCompleteOptions & { 'no-mr'?: boolean; 'mr-title'?: string; 'mr-body'?: string }
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure(t('task.complete.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { service, error } = await createTaskAssignmentService(options);
  if (error || !service) {
    return failure(error ?? t('shared.failedToCreateService'), ExitCode.GENERAL_ERROR);
  }

  try {
    const result = await service.completeTask(taskId as ElementId, {
      summary: options.summary,
      commitHash: options.commitHash,
      createMergeRequest: options['no-mr'] !== true,
      mergeRequestTitle: options['mr-title'],
      mergeRequestBody: options['mr-body'],
      baseBranch: options.baseBranch,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: result.task.id,
        status: result.task.status,
        mergeRequestUrl: result.mergeRequestUrl,
        mergeRequestId: result.mergeRequestId,
      });
    }

    if (mode === 'quiet') {
      return success(result.task.id);
    }

    const lines = [
      t('task.complete.success', { taskId }),
      `  Status: ${result.task.status}`,
    ];
    if (options.summary) {
      lines.push(`  Summary: ${options.summary.slice(0, 50)}${options.summary.length > 50 ? '...' : ''}`);
    }
    if (result.mergeRequestUrl) {
      lines.push(`  MR: ${result.mergeRequestUrl}`);
    }

    return success(result, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('task.complete.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const taskCompleteCommand: Command = {
  name: 'complete',
  description: t('task.complete.description'),
  usage: 'sf task complete <task-id> [options]',
  help: t('task.complete.help'),
  options: taskCompleteOptions,
  handler: taskCompleteHandler as Command['handler'],
};

// ============================================================================
// Task Merge Command
// ============================================================================

interface TaskMergeOptions {
  summary?: string;
}

const taskMergeOptions: CommandOption[] = [
  {
    name: 'summary',
    short: 's',
    description: t('task.merge.option.summary'),
    hasValue: true,
  },
];

async function taskMergeHandler(
  args: string[],
  options: GlobalOptions & TaskMergeOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure(t('task.merge.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorApi(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    // 1. Get task and validate
    const task = await api.get<Task>(taskId as ElementId);
    if (!task) {
      return failure(t('task.merge.notFound', { taskId }), ExitCode.GENERAL_ERROR);
    }
    if (task.status !== TaskStatus.REVIEW) {
      return failure(
        t('task.merge.notReviewStatus', { taskId, status: task.status }),
        ExitCode.GENERAL_ERROR
      );
    }

    const { getOrchestratorTaskMeta, updateOrchestratorTaskMeta } = await import('../../types/task-meta.js');
    const orchestratorMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown>);
    const sourceBranch = orchestratorMeta?.branch;
    const targetBranch = orchestratorMeta?.targetBranch;

    if (!sourceBranch) {
      return failure(t('task.merge.noBranch', { taskId }), ExitCode.GENERAL_ERROR);
    }

    // 2. Derive workspace root from .stoneforge dir
    const { findStoneforgeDir } = await import('@stoneforge/quarry');
    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return failure(t('task.noStoneforge'), ExitCode.GENERAL_ERROR);
    }
    const { default: path } = await import('node:path');
    const workspaceRoot = path.dirname(stoneforgeDir);

    // 3. Call mergeBranch() with syncLocal disabled (we'll do it after bookkeeping)
    const { mergeBranch, syncLocalBranch } = await import('../../git/merge.js');
    const { detectTargetBranch } = await import('../../git/merge.js');
    const commitMessage = `${task.title} (${taskId})`;

    const mergeResult = await mergeBranch({
      workspaceRoot,
      sourceBranch,
      targetBranch,
      commitMessage,
      syncLocal: false,
    });

    if (!mergeResult.success) {
      const lines = [t('task.merge.mergeFailed', { taskId, error: mergeResult.error })];
      if (mergeResult.conflictFiles?.length) {
        lines.push(t('task.merge.conflictFiles'));
        for (const f of mergeResult.conflictFiles) {
          lines.push(`  - ${f}`);
        }
      }
      return failure(lines.join('\n'), ExitCode.GENERAL_ERROR);
    }

    // 3b. Post-merge verification: confirm commits landed on origin before marking as merged
    const { exec: execCb } = await import('node:child_process');
    const { promisify: promisifyUtil } = await import('node:util');
    const execVerify = promisifyUtil(execCb);
    const effectiveTargetForVerify = targetBranch ?? await detectTargetBranch(workspaceRoot);

    try {
      await execVerify(`git fetch origin ${effectiveTargetForVerify}`, { cwd: workspaceRoot });
    } catch (fetchErr) {
      const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return failure(
        t('task.merge.postMergeFetchFailed', { target: effectiveTargetForVerify, error: fetchMsg }),
        ExitCode.GENERAL_ERROR
      );
    }

    if (mergeResult.commitHash) {
      // Verify the merge commit is an ancestor of origin/{targetBranch}
      try {
        await execVerify(
          `git merge-base --is-ancestor ${mergeResult.commitHash} origin/${effectiveTargetForVerify}`,
          { cwd: workspaceRoot }
        );
      } catch {
        return failure(
          t('task.merge.postMergeCommitNotOnTarget', { hash: mergeResult.commitHash, target: effectiveTargetForVerify }),
          ExitCode.GENERAL_ERROR
        );
      }
    } else if (mergeResult.alreadyMerged) {
      // Verify the local source branch has no commits ahead of origin/{targetBranch}
      try {
        const { stdout: countStr } = await execVerify(
          `git rev-list --count origin/${effectiveTargetForVerify}..${sourceBranch}`,
          { cwd: workspaceRoot, encoding: 'utf8' }
        );
        const aheadCount = parseInt(countStr.trim(), 10);
        if (aheadCount > 0) {
          return failure(
            t('task.merge.postMergeCommitsAhead', { branch: sourceBranch, count: aheadCount, target: effectiveTargetForVerify }),
            ExitCode.GENERAL_ERROR
          );
        }
      } catch (revListErr) {
        const revListMsg = revListErr instanceof Error ? revListErr.message : String(revListErr);
        return failure(
          t('task.merge.postMergeVerifyFailed', { branch: sourceBranch, target: effectiveTargetForVerify, error: revListMsg }),
          ExitCode.GENERAL_ERROR
        );
      }
    }

    // 4. Atomic status update: set mergeStatus + close in one call
    const now = createTimestamp();
    const newMeta = updateOrchestratorTaskMeta(
      task.metadata as Record<string, unknown>,
      {
        mergeStatus: 'merged' as import('../../types/task-meta.js').MergeStatus,
        completedAt: now,
        ...(mergeResult.commitHash ? { mergeCommitHash: mergeResult.commitHash } : {}),
        ...(options.summary ? { completionSummary: options.summary } : {}),
      }
    );

    await api.update<Task>(taskId as ElementId, {
      status: TaskStatus.CLOSED,
      assignee: undefined,
      closedAt: now,
      metadata: newMeta,
    });

    // 5. Clean up: delete source branch and remove task worktree (best-effort)
    try {
      await execVerify(`git branch -D ${sourceBranch}`, { cwd: workspaceRoot });
    } catch { /* branch may not exist locally */ }

    try {
      await execVerify(`git push origin --delete ${sourceBranch}`, { cwd: workspaceRoot });
    } catch { /* branch may not exist on remote */ }

    const worktreePath = orchestratorMeta?.worktree;
    if (worktreePath) {
      try {
        await execVerify(`git worktree remove --force "${worktreePath}"`, { cwd: workspaceRoot });
      } catch { /* worktree may already be gone */ }
    }

    // 6. Sync local target branch (best-effort, after all bookkeeping is done)
    try {
      await execVerify('git fetch origin', { cwd: workspaceRoot, encoding: 'utf8' });
    } catch { /* best-effort */ }
    await syncLocalBranch(workspaceRoot, effectiveTargetForVerify);

    // 7. Output result
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId,
        mergeStatus: 'merged',
        commitHash: mergeResult.commitHash,
      });
    }

    if (mode === 'quiet') {
      return success(taskId);
    }

    const lines = [
      t('task.merge.successSummary', { taskId, hash: mergeResult.commitHash }),
    ];

    return success({ taskId, mergeStatus: 'merged', commitHash: mergeResult.commitHash }, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('task.merge.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const taskMergeCommand: Command = {
  name: 'merge',
  description: t('task.merge.description'),
  usage: 'sf task merge <task-id> [options]',
  help: t('task.merge.help'),
  options: taskMergeOptions,
  handler: taskMergeHandler as Command['handler'],
};

// ============================================================================
// Task Reject Command
// ============================================================================

interface TaskRejectOptions {
  reason?: string;
  message?: string;
}

const taskRejectOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: t('task.reject.option.reason'),
    hasValue: true,
  },
  {
    name: 'message',
    short: 'm',
    description: t('task.reject.option.message'),
    hasValue: true,
  },
];

async function taskRejectHandler(
  args: string[],
  options: GlobalOptions & TaskRejectOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure(t('task.reject.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  if (!options.reason) {
    return failure(t('task.reject.reasonRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorApi(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    await api.updateTaskOrchestratorMeta(taskId as ElementId, {
      mergeStatus: 'test_failed',
      mergeFailureReason: options.reason,
      ...(options.message ? { handoffHistory: [{ sessionId: 'cli', message: options.message, handoffAt: new Date().toISOString() }] } : {}),
    });

    await api.update<Task>(taskId as ElementId, {
      status: TaskStatus.OPEN,
      assignee: undefined,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId,
        mergeStatus: 'test_failed',
        reason: options.reason,
        message: options.message,
      });
    }

    if (mode === 'quiet') {
      return success(taskId);
    }

    const lines = [
      t('task.reject.success', { taskId }),
      '  Merge Status: test_failed',
      `  Reason: ${options.reason.slice(0, 50)}${options.reason.length > 50 ? '...' : ''}`,
    ];
    if (options.message) {
      lines.push(`  Handoff: ${options.message.slice(0, 50)}${options.message.length > 50 ? '...' : ''}`);
    }
    lines.push('');
    lines.push(t('task.reject.reopened'));

    return success({ taskId, mergeStatus: 'test_failed' }, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('task.reject.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const taskRejectCommand: Command = {
  name: 'reject',
  description: t('task.reject.description'),
  usage: 'sf task reject <task-id> --reason "..." [options]',
  help: t('task.reject.help'),
  options: taskRejectOptions,
  handler: taskRejectHandler as Command['handler'],
};

// ============================================================================
// Task Sync Command
// ============================================================================

/**
 * Result of a branch sync operation
 */
export interface SyncResult {
  /** Whether the sync succeeded without conflicts */
  success: boolean;
  /** List of conflicted file paths (if any) */
  conflicts?: string[];
  /** Error message (if sync failed for non-conflict reasons) */
  error?: string;
  /** Human-readable message */
  message: string;
  /** The worktree path used */
  worktreePath?: string;
  /** The branch that was synced */
  branch?: string;
}

async function taskSyncHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure(t('task.sync.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorApi(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    // 1. Get task and its metadata
    const task = await api.get<Task>(taskId as ElementId);
    if (!task) {
      return failure(t('task.sync.notFound', { taskId }), ExitCode.GENERAL_ERROR);
    }

    // 2. Extract worktree and branch from task metadata
    const taskMeta = task.metadata as Record<string, unknown> | undefined;
    const orchestratorMeta = taskMeta?.orchestrator as Record<string, unknown> | undefined;
    const worktreePath = orchestratorMeta?.worktree as string | undefined;
    const branch = orchestratorMeta?.branch as string | undefined;

    if (!worktreePath) {
      const syncResult: SyncResult = {
        success: false,
        error: t('task.sync.noWorktree'),
        message: t('task.sync.noWorktreeMessage'),
      };
      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success(syncResult);
      }
      return failure(syncResult.message, ExitCode.GENERAL_ERROR);
    }

    // 3. Check if worktree exists
    const { findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createWorktreeManager } = await import('../../git/worktree-manager.js');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return failure(t('task.noStoneforge'), ExitCode.GENERAL_ERROR);
    }

    // Get workspace root (parent of .stoneforge)
    const path = await import('node:path');
    const workspaceRoot = path.dirname(stoneforgeDir);

    const worktreeManager = createWorktreeManager({ workspaceRoot });
    await worktreeManager.initWorkspace();

    const worktreeExists = await worktreeManager.worktreeExists(worktreePath);
    if (!worktreeExists) {
      const syncResult: SyncResult = {
        success: false,
        error: t('task.sync.worktreeNotFound', { path: worktreePath }),
        message: t('task.sync.worktreeNotFound', { path: worktreePath }),
        worktreePath,
        branch,
      };
      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success(syncResult);
      }
      return failure(syncResult.message, ExitCode.GENERAL_ERROR);
    }

    // 4. Run git fetch and merge in the worktree
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    // Resolve full worktree path
    const fullWorktreePath = path.isAbsolute(worktreePath)
      ? worktreePath
      : path.join(workspaceRoot, worktreePath);

    const remoteAvailable = await worktreeManager.ensureWorktreeRemote(fullWorktreePath);
    if (!remoteAvailable) {
      const syncResult: SyncResult = {
        success: false,
        error: t('task.sync.noOrigin'),
        message: t('task.sync.noOriginMessage'),
        worktreePath,
        branch,
      };
      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success(syncResult);
      }
      return failure(syncResult.message, ExitCode.GENERAL_ERROR);
    }

    // Fetch from origin
    try {
      await execFileAsync('git', ['fetch', 'origin'], {
        cwd: fullWorktreePath,
        encoding: 'utf8',
        timeout: 60_000,
      });
    } catch (fetchError) {
      const syncResult: SyncResult = {
        success: false,
        error: t('task.sync.fetchFailed', { error: (fetchError as Error).message }),
        message: t('task.sync.fetchFailedMessage'),
        worktreePath,
        branch,
      };
      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success(syncResult);
      }
      return failure(syncResult.message, ExitCode.GENERAL_ERROR);
    }

    // Use the task's targetBranch if set, otherwise fall back to default branch
    const targetBranch = orchestratorMeta?.targetBranch as string | undefined;
    const syncBranch = targetBranch ?? await worktreeManager.getDefaultBranch();
    const remoteBranch = `origin/${syncBranch}`;

    // Attempt to merge
    try {
      await execFileAsync('git', ['merge', remoteBranch, '--no-edit'], {
        cwd: fullWorktreePath,
        encoding: 'utf8',
        timeout: 120_000,
      });

      // Merge succeeded
      const syncResult: SyncResult = {
        success: true,
        message: t('task.sync.success', { branch: remoteBranch }),
        worktreePath,
        branch,
      };

      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success(syncResult);
      }
      if (mode === 'quiet') {
        return success('synced');
      }
      return success(syncResult, t('task.sync.success', { branch: remoteBranch }));
    } catch (mergeError) {
      // Check for merge conflicts
      try {
        const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain'], {
          cwd: fullWorktreePath,
          encoding: 'utf8',
        });

        // Parse conflicted files (lines starting with UU, AA, DD, AU, UA, DU, UD)
        const conflictPatterns = /^(UU|AA|DD|AU|UA|DU|UD)\s+(.+)$/gm;
        const conflicts: string[] = [];
        let match;
        while ((match = conflictPatterns.exec(statusOutput)) !== null) {
          conflicts.push(match[2]);
        }

        if (conflicts.length > 0) {
          const syncResult: SyncResult = {
            success: false,
            conflicts,
            message: t('task.sync.conflicts', { count: conflicts.length }),
            worktreePath,
            branch,
          };

          const mode = getOutputMode(options);
          if (mode === 'json') {
            return success(syncResult);
          }
          if (mode === 'quiet') {
            return success(conflicts.join('\n'));
          }

          const lines = [
            t('task.sync.conflictWarning', { count: conflicts.length }),
            ...conflicts.map(f => `  - ${f}`),
            '',
            t('task.sync.resolveConflicts'),
          ];
          return success(syncResult, lines.join('\n'));
        }

        // Some other merge error (not conflicts)
        const syncResult: SyncResult = {
          success: false,
          error: (mergeError as Error).message,
          message: t('task.sync.mergeFailedNotConflicts'),
          worktreePath,
          branch,
        };

        const mode = getOutputMode(options);
        if (mode === 'json') {
          return success(syncResult);
        }
        return failure(syncResult.message, ExitCode.GENERAL_ERROR);
      } catch {
        // Failed to check status
        const syncResult: SyncResult = {
          success: false,
          error: (mergeError as Error).message,
          message: t('task.sync.mergeFailed'),
          worktreePath,
          branch,
        };

        const mode = getOutputMode(options);
        if (mode === 'json') {
          return success(syncResult);
        }
        return failure(syncResult.message, ExitCode.GENERAL_ERROR);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('task.sync.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const taskSyncCommand: Command = {
  name: 'sync',
  description: t('task.sync.description'),
  usage: 'sf task sync <task-id>',
  help: t('task.sync.help'),
  options: [],
  handler: taskSyncHandler as Command['handler'],
};

// ============================================================================
// Task Merge-Status Command
// ============================================================================

import { MergeStatusValues, isMergeStatus, type MergeStatus } from '../../types/task-meta.js';

interface TaskMergeStatusOptions {
  force?: boolean;
}

/**
 * Verify that a task's branch content has been merged into the target branch.
 * Returns null if verification passes, or an error message if it fails.
 *
 * Exported for testing.
 */
export async function verifyMergeStatus(params: {
  branch: string;
  effectiveTarget: string;
  mergeCommitHash?: string;
  force?: boolean;
  execAsync: (cmd: string, opts: Record<string, unknown>) => Promise<{ stdout: string; stderr: string }>;
  workspaceRoot: string;
}): Promise<{ status: 'ok' | 'error' | 'forced'; message?: string }> {
  const { branch, effectiveTarget, mergeCommitHash, force, execAsync, workspaceRoot } = params;

  try {
    // Fetch latest from origin
    await execAsync('git fetch origin', { cwd: workspaceRoot, encoding: 'utf8', timeout: 60_000 });

    // Check if the source branch has commits not on origin/{targetBranch}
    const { stdout: countStr } = await execAsync(
      `git rev-list --count origin/${effectiveTarget}..${branch}`,
      { cwd: workspaceRoot, encoding: 'utf8' }
    );
    const count = parseInt(countStr.trim(), 10);

    if (count > 0) {
      return {
        status: 'error',
        message: t('task.mergeStatus.cannotMarkMerged', { branch, count, target: effectiveTarget }),
      };
    }
    return { status: 'ok' };
  } catch (verifyErr) {
    const errMsg = (verifyErr as Error).message ?? '';
    if (errMsg.includes('unknown revision') || errMsg.includes('bad revision')) {
      // Source branch was deleted — try to verify via merge commit hash
      if (mergeCommitHash) {
        try {
          await execAsync(
            `git merge-base --is-ancestor ${mergeCommitHash} origin/${effectiveTarget}`,
            { cwd: workspaceRoot, encoding: 'utf8' }
          );
          return { status: 'ok' };
        } catch {
          if (force) {
            return {
              status: 'forced',
              message: t('task.mergeStatus.forceWarning', { hash: mergeCommitHash, target: effectiveTarget }),
            };
          }
          return {
            status: 'error',
            message: t('task.mergeStatus.cannotVerifyBranchDeleted', { branch, hash: mergeCommitHash, target: effectiveTarget }),
          };
        }
      } else if (force) {
        return {
          status: 'forced',
          message: t('task.mergeStatus.forceWarningNoHash', { branch }),
        };
      } else {
        return {
          status: 'error',
          message: t('task.mergeStatus.cannotVerifyNoHash', { branch }),
        };
      }
    } else {
      return {
        status: 'error',
        message: t('task.mergeStatus.verifyFailed', { error: errMsg }),
      };
    }
  }
}

async function taskMergeStatusHandler(
  args: string[],
  options: GlobalOptions & TaskMergeStatusOptions
): Promise<CommandResult> {
  const [taskId, statusArg] = args;

  if (!taskId || !statusArg) {
    return failure(
      t('task.mergeStatus.usageError', { validStatuses: MergeStatusValues.join(', ') }),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  // Validate that the provided status is a valid MergeStatus
  if (!isMergeStatus(statusArg)) {
    return failure(
      t('task.mergeStatus.invalidStatus', { status: statusArg, validStatuses: MergeStatusValues.join(', ') }),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const status: MergeStatus = statusArg;

  const { api, error } = await createOrchestratorApi(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    // Terminal statuses (merged, not_applicable) also close the task atomically
    if (status === 'merged' || status === 'not_applicable') {
      const task = await api.get<Task>(taskId as ElementId);
      if (!task) {
        return failure(t('task.mergeStatus.notFound', { taskId }), ExitCode.GENERAL_ERROR);
      }

      // Safety verification: when marking as 'merged', verify commits are actually on origin/target
      if (status === 'merged') {
        const { getOrchestratorTaskMeta } = await import('../../types/task-meta.js');
        const orchestratorMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown>);
        const branch = orchestratorMeta?.branch;
        const targetBranch = orchestratorMeta?.targetBranch;

        // Only verify if the task has branch metadata (skip for legacy/edge cases)
        if (branch) {
          const { findStoneforgeDir } = await import('@stoneforge/quarry');
          const stoneforgeDir = findStoneforgeDir(process.cwd());

          if (stoneforgeDir) {
            const { default: path } = await import('node:path');
            const { exec } = await import('node:child_process');
            const { promisify } = await import('node:util');
            const execAsync = promisify(exec);
            const workspaceRoot = path.dirname(stoneforgeDir);

            // Check if a remote exists (skip verification for local-only workspaces)
            let hasRemote = false;
            try {
              const { stdout } = await execAsync('git remote', { cwd: workspaceRoot, encoding: 'utf8' });
              hasRemote = stdout.trim().length > 0;
            } catch { /* no remote */ }

            if (hasRemote) {
              // Determine effective target branch
              const { detectTargetBranch } = await import('../../git/merge.js');
              const effectiveTarget = targetBranch ?? await detectTargetBranch(workspaceRoot);
              const mergeCommitHash = orchestratorMeta?.mergeCommitHash;

              const result = await verifyMergeStatus({
                branch,
                effectiveTarget,
                mergeCommitHash,
                force: options.force,
                execAsync,
                workspaceRoot,
              });

              if (result.status === 'error') {
                return failure(result.message!, ExitCode.GENERAL_ERROR);
              }
              if (result.status === 'forced' && result.message) {
                console.warn(result.message);
              }
            }
          }
        }
      }

      const { updateOrchestratorTaskMeta } = await import('../../types/task-meta.js');
      const now = createTimestamp();
      const newMeta = updateOrchestratorTaskMeta(
        task.metadata as Record<string, unknown>,
        { mergeStatus: status }
      );

      await api.update<Task>(taskId as ElementId, {
        status: TaskStatus.CLOSED,
        closedAt: now,
        metadata: newMeta,
      });
    } else {
      await api.updateTaskOrchestratorMeta(taskId as ElementId, {
        mergeStatus: status,
      });
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId,
        mergeStatus: status,
      });
    }

    if (mode === 'quiet') {
      return success(taskId);
    }

    const statusLine = (status === 'merged' || status === 'not_applicable')
      ? t('task.mergeStatus.successWithClose', { taskId, status })
      : t('task.mergeStatus.success', { taskId, status });

    return success(
      { taskId, mergeStatus: status },
      statusLine
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('Task not found')) {
      return failure(t('task.mergeStatus.notFound', { taskId }), ExitCode.GENERAL_ERROR);
    }
    return failure(t('task.mergeStatus.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const taskMergeStatusCommand: Command = {
  name: 'merge-status',
  description: t('task.mergeStatus.description'),
  usage: 'sf task merge-status <task-id> <status>',
  help: t('task.mergeStatus.help'),
  options: [
    {
      name: 'force',
      short: 'f',
      description: t('task.mergeStatus.option.force'),
    },
  ],
  handler: taskMergeStatusHandler as Command['handler'],
};

// ============================================================================
// Task Set-Owner Command
// ============================================================================

async function taskSetOwnerHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [taskId, directorId] = args;

  if (!taskId || !directorId) {
    return failure(
      t('task.setOwner.usageError'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const { api, error } = await createOrchestratorApi(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    await api.updateTaskOrchestratorMeta(taskId as ElementId, {
      owningDirector: directorId as unknown as import('@stoneforge/core').EntityId,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId,
        owningDirector: directorId,
      });
    }

    if (mode === 'quiet') {
      return success(taskId);
    }

    return success(
      { taskId, owningDirector: directorId },
      t('task.setOwner.success', { taskId, directorId })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('Task not found')) {
      return failure(t('task.setOwner.notFound', { taskId }), ExitCode.GENERAL_ERROR);
    }
    return failure(t('task.setOwner.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const taskSetOwnerCommand: Command = {
  name: 'set-owner',
  description: t('task.setOwner.description'),
  usage: 'sf task set-owner <task-id> <director-id>',
  help: t('task.setOwner.help'),
  options: [],
  handler: taskSetOwnerHandler as Command['handler'],
};

// ============================================================================
// Main Task Command
// ============================================================================

export const taskCommand: Command = {
  name: 'task',
  description: t('task.description'),
  usage: 'sf task <subcommand> [options]',
  help: t('task.help'),
  subcommands: {
    handoff: taskHandoffCommand,
    complete: taskCompleteCommand,
    merge: taskMergeCommand,
    reject: taskRejectCommand,
    sync: taskSyncCommand,
    'merge-status': taskMergeStatusCommand,
    'set-owner': taskSetOwnerCommand,
  },
  handler: taskHandoffCommand.handler, // Default to handoff
  options: [],
};
