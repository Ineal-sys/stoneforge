/**
 * Task Commands - Task-specific CLI operations
 *
 * Provides CLI commands for task management:
 * - ready: List tasks ready for work
 * - blocked: List blocked tasks with reasons
 * - close: Close a task
 * - reopen: Reopen a closed task
 * - assign: Assign a task to an entity
 * - defer: Defer a task
 * - undefer: Remove deferral from a task
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import { t } from '../i18n/index.js';
import {
  TaskStatus,
  TaskTypeValue,
  updateTaskStatus,
  isValidStatusTransition,
  createDocument,
  ContentType,
  type Task,
  type Priority,
  type Document,
  type DocumentId,
} from '@stoneforge/core';
import type { ElementId, EntityId } from '@stoneforge/core';
import { existsSync as fileExists, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { QuarryAPI, TaskFilter, BlockedTask } from '../../api/types.js';
import {
  createHandler,
  createOptions,
  listHandler,
  listOptions,
  showHandler,
  showOptions,
  updateHandler,
  updateOptions,
  deleteHandler,
  deleteOptions,
} from './crud.js';
import { suggestCommands } from '../suggest.js';
import { createAPI } from '../db.js';

// ============================================================================
// Ready Command
// ============================================================================

interface ReadyOptions {
  assignee?: string;
  priority?: string;
  type?: string;
  limit?: string;
}

const readyOptions: CommandOption[] = [
  {
    name: 'assignee',
    short: 'a',
    description: t('ready.option.assignee'),
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: t('ready.option.priority'),
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: t('ready.option.type'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function readyHandler(
  _args: string[],
  options: GlobalOptions & ReadyOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter from options
    const filter: TaskFilter = {};

    if (options.assignee) {
      filter.assignee = options.assignee as EntityId;
    }

    if (options.priority) {
      const priority = parseInt(options.priority, 10);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        return failure(t('task.error.invalidPriority'), ExitCode.VALIDATION);
      }
      filter.priority = priority as Priority;
    }

    if (options.type) {
      const validTypes: string[] = Object.values(TaskTypeValue);
      if (!validTypes.includes(options.type)) {
        return failure(
          t('task.error.invalidType', { type: options.type, valid: validTypes.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      filter.taskType = options.type as TaskFilter['taskType'];
    }

    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('task.error.invalidLimit'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Get ready tasks
    const tasks = await api.ready(filter);

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    // Human-readable output
    if (tasks.length === 0) {
      return success(null, t('ready.success.noTasks'));
    }

    // Build table data
    const headers = [t('label.id'), t('label.title'), t('label.priority'), t('label.assignee'), t('label.type')];
    const rows = tasks.map((task) => [
      task.id,
      task.title.length > 40 ? task.title.substring(0, 37) + '...' : task.title,
      `P${task.priority}`,
      task.assignee ?? '-',
      task.taskType,
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${t('ready.summary', { count: tasks.length })}`;

    return success(tasks, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('ready.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const readyCommand: Command = {
  name: 'ready',
  description: t('ready.description'),
  usage: 'sf ready [options]',
  help: t('ready.help'),
  options: readyOptions,
  handler: readyHandler as Command['handler'],
};

// ============================================================================
// Backlog Command
// ============================================================================

interface BacklogOptions {
  priority?: string;
  limit?: string;
}

const backlogOptions: CommandOption[] = [
  {
    name: 'priority',
    short: 'p',
    description: t('ready.option.priority'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function backlogHandler(
  _args: string[],
  options: GlobalOptions & BacklogOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const filter: TaskFilter = {};

    if (options.priority) {
      const priority = parseInt(options.priority, 10);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        return failure(t('task.error.invalidPriority'), ExitCode.VALIDATION);
      }
      filter.priority = priority as Priority;
    }

    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('task.error.invalidLimit'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const tasks = await api.backlog(filter);

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    if (tasks.length === 0) {
      return success(null, t('backlog.success.noTasks'));
    }

    const headers = [t('label.id'), t('label.title'), t('label.priority'), t('label.type'), t('label.created')];
    const rows = tasks.map((task) => [
      task.id,
      task.title.length > 40 ? task.title.substring(0, 37) + '...' : task.title,
      `P${task.priority}`,
      task.taskType,
      new Date(task.createdAt).toLocaleDateString(),
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${t('backlog.summary', { count: tasks.length })}`;

    return success(tasks, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('backlog.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const backlogCommand: Command = {
  name: 'backlog',
  description: t('backlog.description'),
  usage: 'sf backlog [options]',
  help: t('backlog.help'),
  options: backlogOptions,
  handler: backlogHandler as Command['handler'],
};

// ============================================================================
// Blocked Command
// ============================================================================

interface BlockedOptions {
  assignee?: string;
  priority?: string;
  limit?: string;
}

const blockedOptions: CommandOption[] = [
  {
    name: 'assignee',
    short: 'a',
    description: t('ready.option.assignee'),
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: t('ready.option.priority'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function blockedHandler(
  _args: string[],
  options: GlobalOptions & BlockedOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter from options
    const filter: TaskFilter = {};

    if (options.assignee) {
      filter.assignee = options.assignee as EntityId;
    }

    if (options.priority) {
      const priority = parseInt(options.priority, 10);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        return failure(t('task.error.invalidPriority'), ExitCode.VALIDATION);
      }
      filter.priority = priority as Priority;
    }

    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('task.error.invalidLimit'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Get blocked tasks
    const tasks = await api.blocked(filter);

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    // Human-readable output
    if (tasks.length === 0) {
      return success(null, t('blocked.success.noTasks'));
    }

    // Build table data
    const headers = [t('label.id'), t('label.title'), t('blocked.label.blockedBy'), t('blocked.label.reason')];
    const rows = tasks.map((task: BlockedTask) => [
      task.id,
      task.title.length > 30 ? task.title.substring(0, 27) + '...' : task.title,
      task.blockedBy,
      task.blockReason.length > 30 ? task.blockReason.substring(0, 27) + '...' : task.blockReason,
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${t('blocked.summary', { count: tasks.length })}`;

    return success(tasks, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('blocked.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const blockedCommand: Command = {
  name: 'blocked',
  description: t('blocked.description'),
  usage: 'sf blocked [options]',
  help: t('blocked.help'),
  options: blockedOptions,
  handler: blockedHandler as Command['handler'],
};

// ============================================================================
// Close Command
// ============================================================================

interface CloseOptions {
  reason?: string;
}

const closeOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: t('close.option.reason'),
    hasValue: true,
  },
];

async function closeHandler(
  args: string[],
  options: GlobalOptions & CloseOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('close.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(t('task.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(t('task.error.notATask', { id }), ExitCode.VALIDATION);
    }

    // Check if already closed
    if (task.status === TaskStatus.CLOSED) {
      return failure(t('close.error.alreadyClosed', { id }), ExitCode.VALIDATION);
    }

    // Check if transition is valid
    if (!isValidStatusTransition(task.status, TaskStatus.CLOSED)) {
      return failure(
        t('close.error.invalidStatus', { status: task.status }),
        ExitCode.VALIDATION
      );
    }

    // Update the task
    const updated = updateTaskStatus(task, {
      status: TaskStatus.CLOSED,
      closeReason: options.reason,
    });

    // Save the update with optimistic concurrency control
    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, t('close.success', { id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('close.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const closeCommand: Command = {
  name: 'close',
  description: t('close.description'),
  usage: 'sf close <id> [options]',
  help: t('close.help'),
  options: closeOptions,
  handler: closeHandler as Command['handler'],
};

// ============================================================================
// Reopen Command
// ============================================================================

interface ReopenOptions {
  message?: string;
}

const reopenOptions: CommandOption[] = [
  {
    name: 'message',
    short: 'm',
    description: t('reopen.option.message'),
    hasValue: true,
  },
];

async function reopenHandler(
  args: string[],
  options: GlobalOptions & ReopenOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('reopen.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(t('task.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(t('task.error.notATask', { id }), ExitCode.VALIDATION);
    }

    // Check if not closed
    if (task.status !== TaskStatus.CLOSED) {
      return failure(t('reopen.error.notClosed', { status: task.status }), ExitCode.VALIDATION);
    }

    // Update status to OPEN (clears closedAt)
    const updated = updateTaskStatus(task, {
      status: TaskStatus.OPEN,
    });

    // Clear assignee and closeReason
    updated.assignee = undefined;
    updated.closeReason = undefined;

    // Clear orchestrator metadata fields while preserving branch/worktree/handoff info
    const orchestratorMeta = (updated.metadata as Record<string, unknown> | undefined)?.orchestrator as Record<string, unknown> | undefined;
    if (orchestratorMeta) {
      const reconciliationCount = (orchestratorMeta.reconciliationCount as number | undefined) ?? 0;
      const clearedMeta = {
        ...orchestratorMeta,
        mergeStatus: undefined,
        mergedAt: undefined,
        mergeFailureReason: undefined,
        assignedAgent: undefined,
        sessionId: undefined,
        startedAt: undefined,
        completedAt: undefined,
        completionSummary: undefined,
        lastCommitHash: undefined,
        testRunCount: undefined,
        lastTestResult: undefined,
        lastSyncResult: undefined,
        reconciliationCount: reconciliationCount + 1,
      };
      (updated as Task & { metadata: Record<string, unknown> }).metadata = {
        ...(updated.metadata as Record<string, unknown>),
        orchestrator: clearedMeta,
      };
    }

    // Save the update with optimistic concurrency control
    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

    // If message provided, append to or create description document
    if (options.message) {
      const reopenLine = t('reopen.reopenLine', { message: options.message });
      if (task.descriptionRef) {
        try {
          const doc = await api.get<Document>(task.descriptionRef as unknown as ElementId);
          if (doc) {
            await api.update<Document>(task.descriptionRef as unknown as ElementId, {
              content: doc.content + '\n\n' + reopenLine,
            } as Partial<Document>);
          }
        } catch {
          // Non-fatal: message is still shown in output
        }
      } else {
        const actor = options.actor as EntityId | undefined;
        const newDoc = await createDocument({
          content: reopenLine,
          contentType: ContentType.MARKDOWN,
          createdBy: actor ?? ('operator' as EntityId),
        }, api.getIdGeneratorConfig());
        const created = await api.create(newDoc as unknown as Document & Record<string, unknown>);
        await api.update<Task>(
          id as ElementId,
          { descriptionRef: created.id as DocumentId },
          { actor }
        );
      }
    }

    // Re-fetch task to get latest state (including any descriptionRef changes)
    const finalTask = await api.get<Task>(id as ElementId);

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(finalTask ?? updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(finalTask ?? updated, t('reopen.success', { id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('reopen.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const reopenCommand: Command = {
  name: 'reopen',
  description: t('reopen.description'),
  usage: 'sf reopen <id> [--message "reason"]',
  help: t('reopen.help'),
  options: reopenOptions,
  handler: reopenHandler as Command['handler'],
};

// ============================================================================
// Assign Command
// ============================================================================

interface AssignOptions {
  unassign?: boolean;
}

const assignOptions: CommandOption[] = [
  {
    name: 'unassign',
    short: 'u',
    description: t('assign.option.unassign'),
  },
];

async function assignHandler(
  args: string[],
  options: GlobalOptions & AssignOptions
): Promise<CommandResult> {
  const [id, assignee] = args;

  if (!id) {
    return failure(t('assign.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  if (!assignee && !options.unassign) {
    return failure(t('assign.error.specifyAssignee'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(t('task.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(t('task.error.notATask', { id }), ExitCode.VALIDATION);
    }

    // Update assignment
    const updates: Partial<Task> = {
      assignee: options.unassign ? undefined : (assignee as EntityId),
    };

    // Save the update with optimistic concurrency control
    const updated = await api.update<Task>(id as ElementId, updates, {
      expectedUpdatedAt: task.updatedAt,
    });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    const message = options.unassign
      ? t('assign.success.unassigned', { id })
      : t('assign.success.assigned', { id, assignee });
    return success(updated, message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('assign.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const assignCommand: Command = {
  name: 'assign',
  description: t('assign.description'),
  usage: 'sf assign <id> [assignee]',
  help: t('assign.help'),
  options: assignOptions,
  handler: assignHandler as Command['handler'],
};

// ============================================================================
// Defer Command
// ============================================================================

interface DeferOptions {
  until?: string;
}

const deferOptions: CommandOption[] = [
  {
    name: 'until',
    description: t('defer.option.until'),
    hasValue: true,
  },
];

async function deferHandler(
  args: string[],
  options: GlobalOptions & DeferOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('defer.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(t('task.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(t('task.error.notATask', { id }), ExitCode.VALIDATION);
    }

    // Check if transition is valid
    if (!isValidStatusTransition(task.status, TaskStatus.DEFERRED)) {
      return failure(
        t('defer.error.invalidStatus', { status: task.status }),
        ExitCode.VALIDATION
      );
    }

    // Parse until date if provided
    let scheduledFor: string | undefined;
    if (options.until) {
      const date = new Date(options.until);
      if (isNaN(date.getTime())) {
        return failure(t('defer.error.invalidDate', { value: options.until }), ExitCode.VALIDATION);
      }
      scheduledFor = date.toISOString();
    }

    // Update the task
    const updated = updateTaskStatus(task, {
      status: TaskStatus.DEFERRED,
    });

    // Add scheduledFor if provided
    if (scheduledFor) {
      (updated as Task).scheduledFor = scheduledFor as Task['scheduledFor'];
    }

    // Save the update with optimistic concurrency control
    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    const message = scheduledFor
      ? t('defer.success.withDate', { id, date: new Date(scheduledFor).toLocaleDateString() })
      : t('defer.success', { id });
    return success(updated, message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('defer.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const deferCommand: Command = {
  name: 'defer',
  description: t('defer.description'),
  usage: 'sf defer <id> [options]',
  help: t('defer.help'),
  options: deferOptions,
  handler: deferHandler as Command['handler'],
};

// ============================================================================
// Undefer Command
// ============================================================================

async function undeferHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('undefer.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(t('task.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(t('task.error.notATask', { id }), ExitCode.VALIDATION);
    }

    // Check if deferred
    if (task.status !== TaskStatus.DEFERRED) {
      return failure(t('undefer.error.notDeferred', { status: task.status }), ExitCode.VALIDATION);
    }

    // Update the task - reopen it
    const updated = updateTaskStatus(task, {
      status: TaskStatus.OPEN,
    });

    // Clear scheduledFor
    (updated as Task).scheduledFor = undefined;

    // Save the update with optimistic concurrency control
    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, t('undefer.success', { id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('undefer.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const undeferCommand: Command = {
  name: 'undefer',
  description: t('undefer.description'),
  usage: 'sf undefer <id>',
  help: t('undefer.help'),
  options: [],
  handler: undeferHandler as Command['handler'],
};

// ============================================================================
// Describe Command
// ============================================================================

interface DescribeOptions {
  content?: string;
  file?: string;
  show?: boolean;
  append?: boolean;
}

const describeOptions: CommandOption[] = [
  {
    name: 'content',
    short: 'c',
    description: t('describe.option.content'),
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: t('describe.option.file'),
    hasValue: true,
  },
  {
    name: 'show',
    short: 's',
    description: t('describe.option.show'),
  },
  {
    name: 'append',
    description: t('describe.option.append'),
  },
];

async function describeHandler(
  args: string[],
  options: GlobalOptions & DescribeOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('describe.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(t('task.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(t('task.error.notATask', { id }), ExitCode.VALIDATION);
    }

    // Show mode - display current description
    if (options.show) {
      const mode = getOutputMode(options);

      if (!task.descriptionRef) {
        if (mode === 'json') {
          return success({ taskId: id, description: null });
        }
        return success(null, t('describe.success.noDescription', { id }));
      }

      // Get the description document
      const doc = await api.get<Document>(task.descriptionRef as ElementId);
      if (!doc) {
        return failure(t('describe.error.docNotFound', { ref: task.descriptionRef }), ExitCode.NOT_FOUND);
      }

      if (mode === 'json') {
        return success({ taskId: id, descriptionRef: task.descriptionRef, content: doc.content });
      }

      if (mode === 'quiet') {
        return success(doc.content);
      }

      return success(doc, t('describe.success.show', { id, content: doc.content }));
    }

    // Set mode - must specify either --content or --file
    if (!options.content && !options.file) {
      return failure(t('describe.error.contentOrFileRequired'), ExitCode.INVALID_ARGUMENTS);
    }

    if (options.content && options.file) {
      return failure(t('describe.error.contentAndFile'), ExitCode.INVALID_ARGUMENTS);
    }

    // Get new content
    let content: string;
    if (options.content) {
      content = options.content;
    } else {
      const filePath = resolve(options.file!);
      if (!fileExists(filePath)) {
        return failure(t('describe.error.fileNotFound', { path: filePath }), ExitCode.NOT_FOUND);
      }
      content = readFileSync(filePath, 'utf-8');
    }

    const actor = options.actor as EntityId | undefined;

    // Check if task already has a description document
    if (task.descriptionRef) {
      let finalContent = content;

      // If appending, fetch existing content and combine
      if (options.append) {
        const existingDoc = await api.get<Document>(task.descriptionRef as ElementId);
        if (existingDoc) {
          finalContent = existingDoc.content + '\n\n' + content;
        }
      }

      // Update existing document
      const updated = await api.update<Document>(
        task.descriptionRef as ElementId,
        { content: finalContent },
        { actor }
      );

      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success({ taskId: id, descriptionRef: task.descriptionRef, document: updated, appended: options.append ?? false });
      }
      if (mode === 'quiet') {
        return success(task.descriptionRef);
      }

      const action = options.append ? t('describe.label.appended') : t('describe.label.updated');
      return success(updated, t('describe.success.updated', { action, id, ref: task.descriptionRef, version: updated.version }));
    } else {
      // Create new description document
      const docInput = {
        content,
        contentType: ContentType.MARKDOWN,
        createdBy: actor ?? ('operator' as EntityId),
      };

      const newDoc = await createDocument(docInput, api.getIdGeneratorConfig());
      const created = await api.create(newDoc as unknown as Document & Record<string, unknown>);

      // Update task with description reference
      await api.update<Task>(
        id as ElementId,
        { descriptionRef: created.id as DocumentId },
        { actor, expectedUpdatedAt: task.updatedAt }
      );

      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success({ taskId: id, descriptionRef: created.id, document: created });
      }
      if (mode === 'quiet') {
        return success(created.id);
      }

      return success(created, t('describe.success.created', { id, docId: created.id }));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('describe.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const describeCommand: Command = {
  name: 'describe',
  description: t('describe.description'),
  usage: 'sf task describe <id> --content <text> | --file <path> | --show',
  help: t('describe.help'),
  options: describeOptions,
  handler: describeHandler as Command['handler'],
};

// ============================================================================
// Activate Command
// ============================================================================

async function activateHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('activate.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(t('task.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(t('task.error.notATask', { id }), ExitCode.VALIDATION);
    }

    if (task.status !== TaskStatus.BACKLOG) {
      return failure(t('activate.error.notBacklog', { status: task.status }), ExitCode.VALIDATION);
    }

    const updated = updateTaskStatus(task, {
      status: TaskStatus.OPEN,
    });

    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, t('activate.success', { id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('activate.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const activateCommand: Command = {
  name: 'activate',
  description: t('activate.description'),
  usage: 'sf task activate <id>',
  help: t('activate.help'),
  options: [],
  handler: activateHandler as Command['handler'],
};

// ============================================================================
// CRUD Wrapper Commands (delegate to crud.ts handlers with 'task' pre-filled)
// ============================================================================

const taskCreateCommand: Command = {
  name: 'create',
  description: t('taskCreate.description'),
  usage: 'sf task create [options]',
  help: t('taskCreate.help'),
  options: createOptions,
  handler: ((args: string[], options: GlobalOptions) =>
    createHandler(['task', ...args], options)) as Command['handler'],
};

// Extended list options with --ready flag for dispatch-ready filtering
const taskListOptions: CommandOption[] = [
  ...listOptions,
  {
    name: 'ready',
    description: t('taskList.option.ready'),
  },
];

interface TaskListOptions {
  ready?: boolean;
  status?: string;
  assignee?: string;
  priority?: string;
  type?: string;
  tag?: string[];
  limit?: string;
  offset?: string;
}

async function taskListHandler(
  args: string[],
  options: GlobalOptions & TaskListOptions
): Promise<CommandResult> {
  // Validate mutual exclusivity of --ready and --status
  if (options.ready && options.status) {
    return failure(
      t('taskList.error.readyAndStatus'),
      ExitCode.VALIDATION
    );
  }

  // If --ready is specified, use the ready() API method
  if (options.ready) {
    const { api, error } = createAPI(options);
    if (error) {
      return failure(error, ExitCode.GENERAL_ERROR);
    }

    try {
      // Build filter from options (same filters ready() supports)
      const filter: TaskFilter = {};

      if (options.assignee) {
        filter.assignee = options.assignee as EntityId;
      }

      if (options.priority) {
        const priority = parseInt(options.priority, 10);
        if (isNaN(priority) || priority < 1 || priority > 5) {
          return failure('Priority must be a number from 1 to 5', ExitCode.VALIDATION);
        }
        filter.priority = priority as Priority;
      }

      if (options.type) {
        const validTypes: string[] = Object.values(TaskTypeValue);
        if (!validTypes.includes(options.type)) {
          return failure(
            `Invalid task type: ${options.type}. Must be one of: ${validTypes.join(', ')}`,
            ExitCode.VALIDATION
          );
        }
        filter.taskType = options.type as TaskFilter['taskType'];
      }

      if (options.limit) {
        const limit = parseInt(options.limit, 10);
        if (isNaN(limit) || limit < 1) {
          return failure('Limit must be a positive number', ExitCode.VALIDATION);
        }
        filter.limit = limit;
      }

      // Get ready tasks
      const tasks = await api.ready(filter);

      // Format output based on mode
      const mode = getOutputMode(options);
      const formatter = getFormatter(mode);

      if (mode === 'json') {
        return success(tasks);
      }

      if (mode === 'quiet') {
        return success(tasks.map((t) => t.id).join('\n'));
      }

      // Human-readable output
      if (tasks.length === 0) {
        return success(null, t('ready.success.noTasks'));
      }

      // Build table data (same format as sf task list)
      const headers = [t('label.id'), t('label.type'), t('label.titleName'), t('label.status'), t('label.priority'), t('label.assignee'), t('label.created')];
      const rows = tasks.map((task) => {
        const title = task.title.length > 40 ? task.title.substring(0, 37) + '...' : task.title;
        const statusIcon = task.status === TaskStatus.OPEN ? '\u25CB' : '\u25D4';
        const status = `${statusIcon} ${task.status}`;
        const created = task.createdAt.split('T')[0];
        return [
          task.id,
          task.type,
          title,
          status,
          `P${task.priority}`,
          task.assignee ?? '-',
          created,
        ];
      });

      const table = formatter.table(headers, rows);
      const summary = `\n${t('taskList.readySummary', { count: tasks.length })}`;

      return success(tasks, table + summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(t('taskList.error.failedReady', { message }), ExitCode.GENERAL_ERROR);
    }
  }

  // Default: delegate to the standard list handler
  return listHandler(['task', ...args], options);
}

const taskListCommand: Command = {
  name: 'list',
  description: t('taskList.description'),
  usage: 'sf task list [options]',
  help: t('taskList.help'),
  options: taskListOptions,
  handler: taskListHandler as Command['handler'],
};

const taskShowCommand: Command = {
  name: 'show',
  description: t('taskShow.description'),
  usage: 'sf task show <id> [options]',
  help: t('taskShow.help'),
  options: showOptions,
  handler: showHandler as Command['handler'],
};

const taskUpdateCommand: Command = {
  name: 'update',
  description: t('taskUpdate.description'),
  usage: 'sf task update <id> [options]',
  help: t('taskUpdate.help'),
  options: updateOptions,
  handler: updateHandler as Command['handler'],
};

const taskDeleteCommand: Command = {
  name: 'delete',
  description: t('taskDelete.description'),
  usage: 'sf task delete <id> [options]',
  help: t('taskDelete.help'),
  options: deleteOptions,
  handler: deleteHandler as Command['handler'],
};

// ============================================================================
// Task Root Command
// ============================================================================

const allTaskSubcommands: Record<string, Command> = {
  // CRUD
  create: taskCreateCommand,
  list: taskListCommand,
  show: taskShowCommand,
  update: taskUpdateCommand,
  delete: taskDeleteCommand,
  // Status
  ready: readyCommand,
  blocked: blockedCommand,
  backlog: backlogCommand,
  close: closeCommand,
  reopen: reopenCommand,
  // Assignment
  assign: assignCommand,
  // Scheduling
  defer: deferCommand,
  undefer: undeferCommand,
  // Description
  describe: describeCommand,
  activate: activateCommand,
  // Aliases (hidden from --help via dedup in getCommandHelp)
  new: taskCreateCommand,
  add: taskCreateCommand,
  ls: taskListCommand,
  rm: taskDeleteCommand,
  get: taskShowCommand,
  view: taskShowCommand,
  edit: taskUpdateCommand,
};

export const taskCommand: Command = {
  name: 'task',
  description: t('task.description'),
  usage: 'sf task <subcommand> [options]',
  help: t('task.help'),
  subcommands: allTaskSubcommands,
  handler: async (args, _options): Promise<CommandResult> => {
    if (args.length === 0) {
      return failure(
        t('task.error.usage'),
        ExitCode.INVALID_ARGUMENTS
      );
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(allTaskSubcommands);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = t('task.error.unknownSubcommand', { subcommand: args[0] });
    if (suggestions.length > 0) {
      msg += `\n\n${t('label.didYouMean')}\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += `\n\n${t('task.error.usage')}`;
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
