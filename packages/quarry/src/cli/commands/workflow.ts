/**
 * Workflow Commands - Collection command interface for workflows
 *
 * Provides CLI commands for workflow operations:
 * - workflow create: Instantiate a playbook into a workflow
 * - workflow list: List workflows with filtering
 * - workflow show: Show workflow details
 * - workflow tasks: List tasks in a workflow
 * - workflow progress: Show workflow progress metrics
 * - workflow delete: Delete ephemeral workflow and tasks
 * - workflow promote: Promote ephemeral to durable
 * - workflow gc: Garbage collect old ephemeral workflows
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode, getStatusIcon } from '../formatter.js';
import { t } from '../i18n/index.js';
import {
  createWorkflow,
  WorkflowStatus,
  promoteWorkflow,
  filterGarbageCollectionByAge,
  type Workflow,
  type CreateWorkflowInput,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Constants
// ============================================================================

// Default GC age: 7 days in milliseconds
const DEFAULT_GC_AGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// Workflow Create Command
// ============================================================================

interface WorkflowCreateOptions {
  var?: string | string[];
  ephemeral?: boolean;
  title?: string;
}

const workflowCreateOptions: CommandOption[] = [
  {
    name: 'var',
    description: t('workflow.create.option.var'),
    hasValue: true,
    array: true,
  },
  {
    name: 'ephemeral',
    short: 'e',
    description: t('workflow.create.option.ephemeral'),
    hasValue: false,
  },
  {
    name: 'title',
    short: 't',
    description: t('workflow.create.option.title'),
    hasValue: true,
  },
];

async function workflowCreateHandler(
  args: string[],
  options: GlobalOptions & WorkflowCreateOptions
): Promise<CommandResult> {
  const [playbookNameOrId] = args;

  if (!playbookNameOrId) {
    return failure(t('workflow.create.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Parse variables
    const variables: Record<string, unknown> = {};
    if (options.var) {
      const varArgs = Array.isArray(options.var) ? options.var : [options.var];
      for (const varArg of varArgs) {
        const eqIndex = varArg.indexOf('=');
        if (eqIndex === -1) {
          return failure(
            t('workflow.create.error.invalidVarFormat', { varArg }),
            ExitCode.VALIDATION
          );
        }
        const name = varArg.slice(0, eqIndex);
        const value = varArg.slice(eqIndex + 1);
        variables[name] = value;
      }
    }

    // For now, create a workflow directly
    // TODO: When playbook instantiation is implemented, look up playbook and create workflow
    const title = options.title || t('workflow.create.defaultTitle', { playbook: playbookNameOrId });

    const input: CreateWorkflowInput = {
      title,
      createdBy: actor,
      ephemeral: options.ephemeral ?? false,
      variables,
      // playbookId would be set here when playbook lookup is implemented
    };

    const workflow = await createWorkflow(input, api.getIdGeneratorConfig());
    const created = await api.create(workflow as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, t('workflow.create.success', { id: created.id, ephemeral: options.ephemeral ? t('workflow.create.ephemeralLabel') : '' }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('workflow.create.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const workflowCreateCommand: Command = {
  name: 'create',
  description: t('workflow.create.description'),
  usage: 'sf workflow create <playbook> [options]',
  help: t('workflow.create.help'),
  options: workflowCreateOptions,
  handler: workflowCreateHandler as Command['handler'],
};

// ============================================================================
// Workflow List Command
// ============================================================================

interface WorkflowListOptions {
  status?: string;
  ephemeral?: boolean;
  durable?: boolean;
  limit?: string;
}

const workflowListOptions: CommandOption[] = [
  {
    name: 'status',
    short: 's',
    description: t('workflow.list.option.status'),
    hasValue: true,
  },
  {
    name: 'ephemeral',
    short: 'e',
    description: t('workflow.list.option.ephemeral'),
    hasValue: false,
  },
  {
    name: 'durable',
    short: 'd',
    description: t('workflow.list.option.durable'),
    hasValue: false,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function workflowListHandler(
  _args: string[],
  options: GlobalOptions & WorkflowListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'workflow',
    };

    // Status filter
    if (options.status) {
      const validStatuses = Object.values(WorkflowStatus);
      if (!validStatuses.includes(options.status as WorkflowStatus)) {
        return failure(
          t('workflow.error.invalidStatus', { status: options.status, valid: validStatuses.join(', ') }),
          ExitCode.VALIDATION
        );
      }
    }

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Workflow>(filter);

    // Post-filter
    let items = result.items;

    // Status filter
    if (options.status) {
      items = items.filter((w) => w.status === options.status);
    }

    // Ephemeral/durable filter
    if (options.ephemeral && !options.durable) {
      items = items.filter((w) => w.ephemeral);
    } else if (options.durable && !options.ephemeral) {
      items = items.filter((w) => !w.ephemeral);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((w) => w.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, t('workflow.list.empty'));
    }

    // Build table
    const headers = [t('label.id'), t('label.title'), t('label.status'), t('label.mode'), t('label.created')];
    const rows = items.map((w) => [
      w.id,
      w.title.length > 40 ? w.title.substring(0, 37) + '...' : w.title,
      `${getStatusIcon(w.status)} ${w.status}`,
      w.ephemeral ? t('workflow.label.ephemeral') : t('workflow.label.durable'),
      w.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${t('workflow.list.summary', { shown: items.length, total: result.total })}`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('workflow.list.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const workflowListCommand: Command = {
  name: 'list',
  description: t('workflow.list.description'),
  usage: 'sf workflow list [options]',
  help: t('workflow.list.help'),
  options: workflowListOptions,
  handler: workflowListHandler as Command['handler'],
};

// ============================================================================
// Workflow Show Command
// ============================================================================

async function workflowShowHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('workflow.show.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const workflow = await api.get<Workflow>(id as ElementId);

    if (!workflow) {
      return failure(t('workflow.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (workflow.type !== 'workflow') {
      return failure(t('workflow.error.notWorkflow', { id, type: workflow.type }), ExitCode.VALIDATION);
    }

    // Check if workflow is deleted (tombstone)
    const data = workflow as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(t('workflow.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(workflow);
    }

    if (mode === 'quiet') {
      return success(workflow.id);
    }

    // Human-readable output
    let output = formatter.element(workflow as unknown as Record<string, unknown>);

    // Add workflow-specific info
    output += `\n\n${t('workflow.show.infoSection')}\n`;
    output += `${t('label.mode')}:      ${workflow.ephemeral ? t('workflow.label.ephemeral') : t('workflow.label.durable')}\n`;
    if (workflow.playbookId) {
      output += `${t('label.playbook')}:  ${workflow.playbookId}\n`;
    }
    if (workflow.startedAt) {
      output += `${t('label.started')}:   ${workflow.startedAt}\n`;
    }
    if (workflow.finishedAt) {
      output += `${t('label.finished')}:  ${workflow.finishedAt}\n`;
    }
    if (workflow.failureReason) {
      output += `${t('label.failure')}:   ${workflow.failureReason}\n`;
    }
    if (workflow.cancelReason) {
      output += `${t('label.cancelled')}: ${workflow.cancelReason}\n`;
    }

    // Show variables if any
    const varKeys = Object.keys(workflow.variables);
    if (varKeys.length > 0) {
      output += `\n${t('workflow.show.variablesSection')}\n`;
      for (const key of varKeys) {
        output += `${key}: ${JSON.stringify(workflow.variables[key])}\n`;
      }
    }

    return success(workflow, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('workflow.show.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const workflowShowCommand: Command = {
  name: 'show',
  description: t('workflow.show.description'),
  usage: 'sf workflow show <id>',
  help: t('workflow.show.help'),
  handler: workflowShowHandler as Command['handler'],
};

// ============================================================================
// Workflow Tasks Command
// ============================================================================

interface WorkflowTasksOptions {
  ready?: boolean;
  status?: string;
  limit?: string;
}

const workflowTasksOptions: CommandOption[] = [
  {
    name: 'ready',
    short: 'r',
    description: t('workflow.tasks.option.ready'),
    hasValue: false,
  },
  {
    name: 'status',
    short: 's',
    description: t('workflow.tasks.option.status'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function workflowTasksHandler(
  args: string[],
  options: GlobalOptions & WorkflowTasksOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('workflow.tasks.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {};

    // Status filter
    if (options.status) {
      const validStatuses = ['open', 'in_progress', 'blocked', 'closed', 'deferred', 'tombstone'];
      if (!validStatuses.includes(options.status)) {
        return failure(
          t('workflow.tasks.error.invalidStatus', { status: options.status, valid: validStatuses.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      filter.status = options.status;
    }

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Get tasks based on --ready flag
    const tasks = options.ready
      ? await api.getReadyTasksInWorkflow(id as ElementId, filter)
      : await api.getTasksInWorkflow(id as ElementId, filter);

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    if (tasks.length === 0) {
      return success(null, options.ready ? t('workflow.tasks.noReadyTasks') : t('workflow.tasks.noTasks'));
    }

    // Build table
    const headers = [t('label.id'), t('label.title'), t('label.status'), t('label.priority'), t('label.assignee')];
    const rows = tasks.map((t) => [
      t.id,
      t.title.length > 40 ? t.title.substring(0, 37) + '...' : t.title,
      `${getStatusIcon(t.status)} ${t.status}`,
      `P${t.priority}`,
      t.assignee ?? '-',
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${t('workflow.tasks.summary', { count: tasks.length })}`;

    return success(tasks, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('workflow.tasks.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const workflowTasksCommand: Command = {
  name: 'tasks',
  description: t('workflow.tasks.description'),
  usage: 'sf workflow tasks <id> [options]',
  help: t('workflow.tasks.help'),
  options: workflowTasksOptions,
  handler: workflowTasksHandler as Command['handler'],
};

// ============================================================================
// Workflow Progress Command
// ============================================================================

async function workflowProgressHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('workflow.progress.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const progress = await api.getWorkflowProgress(id as ElementId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(progress);
    }

    if (mode === 'quiet') {
      return success(`${progress.completionPercentage}%`);
    }

    // Human-readable output
    let output = `${t('workflow.progress.title', { id })}\n\n`;
    output += `${t('workflow.progress.totalTasks')}:   ${progress.totalTasks}\n`;
    output += `${t('label.completion')}:    ${progress.completionPercentage}%\n`;
    output += `${t('workflow.progress.readyTasks')}:   ${progress.readyTasks}\n`;
    output += `${t('workflow.progress.blockedTasks')}: ${progress.blockedTasks}\n\n`;
    output += `${t('workflow.progress.statusBreakdown')}\n`;

    const statusOrder = ['open', 'in_progress', 'blocked', 'closed', 'deferred'];
    for (const status of statusOrder) {
      const count = progress.statusCounts[status] ?? 0;
      if (count > 0) {
        output += `${getStatusIcon(status)} ${status}: ${count}\n`;
      }
    }

    // Visual progress bar
    const barWidth = 30;
    const filled = Math.round((progress.completionPercentage / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    output += `\n[${bar}] ${progress.completionPercentage}%`;

    return success(progress, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('workflow.progress.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const workflowProgressCommand: Command = {
  name: 'progress',
  description: t('workflow.progress.description'),
  usage: 'sf workflow progress <id>',
  help: t('workflow.progress.help'),
  handler: workflowProgressHandler as Command['handler'],
};

// ============================================================================
// Workflow Delete Command
// ============================================================================

interface WorkflowDeleteOptions {
  force?: boolean;
}

const workflowDeleteOptions: CommandOption[] = [
  {
    name: 'force',
    short: 'f',
    description: t('workflow.delete.option.force'),
    hasValue: false,
  },
];

async function workflowDeleteHandler(
  args: string[],
  options: GlobalOptions & WorkflowDeleteOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('workflow.delete.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const workflow = await api.get<Workflow>(id as ElementId);

    if (!workflow) {
      return failure(t('workflow.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (workflow.type !== 'workflow') {
      return failure(t('workflow.error.notWorkflow', { id, type: workflow.type }), ExitCode.VALIDATION);
    }

    // Check if workflow is deleted (tombstone)
    const data = workflow as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(t('workflow.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (!workflow.ephemeral && !options.force) {
      return failure(
        t('workflow.delete.error.durableWorkflow', { id }),
        ExitCode.VALIDATION
      );
    }

    const actor = resolveActor(options);

    // Use deleteWorkflow API to delete workflow and all its tasks
    const result = await api.deleteWorkflow(id as ElementId, { actor });

    return success(
      result,
      t('workflow.delete.success', { id, tasksDeleted: result.tasksDeleted, depsDeleted: result.dependenciesDeleted })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('workflow.delete.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const workflowDeleteCommand: Command = {
  name: 'delete',
  description: t('workflow.delete.description'),
  usage: 'sf workflow delete <id>',
  help: t('workflow.delete.help'),
  options: workflowDeleteOptions,
  handler: workflowDeleteHandler as Command['handler'],
};

// ============================================================================
// Workflow Promote Command
// ============================================================================

async function workflowPromoteHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('workflow.promote.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const workflow = await api.get<Workflow>(id as ElementId);

    if (!workflow) {
      return failure(t('workflow.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (workflow.type !== 'workflow') {
      return failure(t('workflow.error.notWorkflow', { id, type: workflow.type }), ExitCode.VALIDATION);
    }

    // Check if workflow is deleted (tombstone)
    const data = workflow as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(t('workflow.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (!workflow.ephemeral) {
      return success(workflow, t('workflow.promote.alreadyDurable', { id }));
    }

    const actor = resolveActor(options);

    // Use the promoteWorkflow function to get updated values
    const promoted = promoteWorkflow(workflow);

    // Update in database
    const updated = await api.update<Workflow>(
      id as ElementId,
      { ephemeral: promoted.ephemeral },
      { actor }
    );

    return success(updated, t('workflow.promote.success', { id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('workflow.promote.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const workflowPromoteCommand: Command = {
  name: 'promote',
  description: t('workflow.promote.description'),
  usage: 'sf workflow promote <id>',
  help: t('workflow.promote.help'),
  handler: workflowPromoteHandler as Command['handler'],
};

// ============================================================================
// Workflow GC Command
// ============================================================================

interface WorkflowGcOptions {
  age?: string;
  dryRun?: boolean;
}

const workflowGcOptions: CommandOption[] = [
  {
    name: 'age',
    short: 'a',
    description: t('workflow.gc.option.age', { default: String(DEFAULT_GC_AGE_DAYS) }),
    hasValue: true,
  },
  {
    name: 'dry-run',
    description: t('workflow.gc.option.dryRun'),
    hasValue: false,
  },
];

async function workflowGcHandler(
  _args: string[],
  options: GlobalOptions & WorkflowGcOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Parse age
    let ageDays = DEFAULT_GC_AGE_DAYS;
    if (options.age) {
      ageDays = parseInt(options.age, 10);
      if (isNaN(ageDays) || ageDays < 0) {
        return failure(t('workflow.gc.error.invalidAge'), ExitCode.VALIDATION);
      }
    }

    const maxAgeMs = ageDays * MS_PER_DAY;

    // Check if dry run by getting eligible workflows first
    if (options.dryRun) {
      // Get all workflows for preview
      const allWorkflows = await api.list<Workflow>({ type: 'workflow' });

      // Filter to those eligible for GC
      const eligible = filterGarbageCollectionByAge(allWorkflows, maxAgeMs);

      if (eligible.length === 0) {
        return success({ deleted: 0 }, t('workflow.gc.notEligible'));
      }

      const mode = getOutputMode(options);
      const formatter = getFormatter(mode);

      if (mode === 'json') {
        return success({ wouldDelete: eligible.map((w) => w.id), count: eligible.length });
      }

      if (mode === 'quiet') {
        return success(eligible.map((w) => w.id).join('\n'));
      }

      const headers = [t('label.id'), t('label.title'), t('label.status'), t('label.finished')];
      const rows = eligible.map((w) => [
        w.id,
        w.title.length > 40 ? w.title.substring(0, 37) + '...' : w.title,
        w.status,
        w.finishedAt ? w.finishedAt.split('T')[0] : '-',
      ]);

      const table = formatter.table(headers, rows);
      return success(
        { wouldDelete: eligible.map((w) => w.id), count: eligible.length },
        t('workflow.gc.wouldDelete', { count: eligible.length }) + `\n${table}`
      );
    }

    // Use garbageCollectWorkflows API
    const gcResult = await api.garbageCollectWorkflows({
      maxAgeMs,
      dryRun: false,
    });

    if (gcResult.workflowsDeleted === 0) {
      return success({ deleted: 0 }, t('workflow.gc.notEligible'));
    }

    return success(
      gcResult,
      t('workflow.gc.success', { workflows: gcResult.workflowsDeleted, tasks: gcResult.tasksDeleted, deps: gcResult.dependenciesDeleted })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('workflow.gc.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const workflowGcCommand: Command = {
  name: 'gc',
  description: t('workflow.gc.description'),
  usage: 'sf workflow gc [options]',
  help: t('workflow.gc.help'),
  options: workflowGcOptions,
  handler: workflowGcHandler as Command['handler'],
};

// ============================================================================
// Workflow Root Command
// ============================================================================

export const workflowCommand: Command = {
  name: 'workflow',
  description: t('workflow.description'),
  usage: 'sf workflow <subcommand> [options]',
  help: t('workflow.help'),
  subcommands: {
    create: workflowCreateCommand,
    list: workflowListCommand,
    show: workflowShowCommand,
    tasks: workflowTasksCommand,
    progress: workflowProgressCommand,
    delete: workflowDeleteCommand,
    promote: workflowPromoteCommand,
    gc: workflowGcCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: workflowCreateCommand,
    add: workflowCreateCommand,
    ls: workflowListCommand,
    rm: workflowDeleteCommand,
    get: workflowShowCommand,
    view: workflowShowCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return workflowListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(workflowCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = t('error.unknownSubcommand', { subcommand: args[0] });
    if (suggestions.length > 0) {
      msg += `\n\n${t('error.didYouMean')}\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\n' + t('error.runHelp', { command: 'sf workflow' });
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
