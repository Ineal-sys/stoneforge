/**
 * Dispatch Commands - CLI operations for task dispatch
 *
 * Provides commands for dispatching tasks to agents:
 * - dispatch <task-id> <agent-id>: Dispatch a task to a specific agent
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getOutputMode } from '@stoneforge/quarry/cli';
import type { ElementId, EntityId } from '@stoneforge/core';
import type { OrchestratorAPI } from '../../api/index.js';
import { t } from '../i18n/index.js';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates orchestrator API client
 */
async function createOrchestratorClient(options: GlobalOptions): Promise<{
  api: OrchestratorAPI | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createOrchestratorAPI } = await import('../../api/index.js');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return {
        api: null,
        error: t('shared.noStoneforge'),
      };
    }

    const dbPath = options.db ?? `${stoneforgeDir}/stoneforge.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createOrchestratorAPI(backend);

    return { api };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { api: null, error: t('shared.apiInitFailed', { message }) };
  }
}

// ============================================================================
// Dispatch to Agent Command
// ============================================================================

interface DispatchOptions {
  branch?: string;
  worktree?: string;
  session?: string;
  markAsStarted?: boolean;
}

const dispatchOptions: CommandOption[] = [
  {
    name: 'branch',
    short: 'b',
    description: t('dispatch.option.branch'),
    hasValue: true,
  },
  {
    name: 'worktree',
    short: 'w',
    description: t('dispatch.option.worktree'),
    hasValue: true,
  },
  {
    name: 'session',
    short: 's',
    description: t('dispatch.option.session'),
    hasValue: true,
  },
  {
    name: 'markAsStarted',
    short: 'm',
    description: t('dispatch.option.markAsStarted'),
  },
];

async function dispatchHandler(
  args: string[],
  options: GlobalOptions & DispatchOptions
): Promise<CommandResult> {
  const [taskId, agentId] = args;

  if (!taskId || !agentId) {
    return failure(t('dispatch.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    // Assign the task to the agent
    const task = await api.assignTaskToAgent(
      taskId as ElementId,
      agentId as EntityId,
      {
        branch: options.branch,
        worktree: options.worktree,
        sessionId: options.session,
        markAsStarted: options.markAsStarted,
      }
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: task.id,
        agentId,
        branch: options.branch,
        worktree: options.worktree,
        markAsStarted: options.markAsStarted ?? false,
      });
    }

    if (mode === 'quiet') {
      return success(task.id);
    }

    const message = options.markAsStarted
      ? t('dispatch.successMarkedStarted', { taskId, agentId })
      : t('dispatch.success', { taskId, agentId });

    return success(task, message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('dispatch.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Main Dispatch Command
// ============================================================================

export const dispatchCommand: Command = {
  name: 'dispatch',
  description: t('dispatch.description'),
  usage: 'sf dispatch <task-id> <agent-id> [options]',
  help: t('dispatch.help'),
  options: dispatchOptions,
  handler: dispatchHandler as Command['handler'],
};
