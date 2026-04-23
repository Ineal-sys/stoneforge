/**
 * Plan Commands - Collection command interface for plans
 *
 * Provides CLI commands for plan operations:
 * - plan create: Create a new plan
 * - plan list: List plans with filtering
 * - plan show: Show plan details with progress
 * - plan activate: Activate a plan (draft -> active)
 * - plan complete: Complete a plan (active -> completed)
 * - plan cancel: Cancel a plan
 * - plan add-task: Add a task to a plan
 * - plan remove-task: Remove a task from a plan
 * - plan tasks: List tasks in a plan
 * - plan auto-complete: Auto-complete active plans where all tasks are closed
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode, getStatusIcon } from '../formatter.js';
import { t } from '../i18n/index.js';
import { createPlan, PlanStatus, canAutoComplete, TaskStatus, type CreatePlanInput, type Plan } from '@stoneforge/core';
import type { Task } from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI, TaskFilter } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Plan Create Command
// ============================================================================

interface PlanCreateOptions {
  title?: string;
  status?: string;
  tag?: string[];
}

const planCreateOptions: CommandOption[] = [
  {
    name: 'title',
    short: 't',
    description: t('plan.create.option.title'),
    hasValue: true,
    required: true,
  },
  {
    name: 'status',
    short: 's',
    description: t('plan.create.option.status'),
    hasValue: true,
  },
  {
    name: 'tag',
    description: t('plan.create.option.tag'),
    hasValue: true,
    array: true,
  },
];

async function planCreateHandler(
  _args: string[],
  options: GlobalOptions & PlanCreateOptions
): Promise<CommandResult> {
  if (!options.title) {
    return failure(t('plan.create.error.titleRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  // Validate status if provided
  if (options.status) {
    const validStatuses: PlanStatus[] = [PlanStatus.DRAFT, PlanStatus.ACTIVE];
    if (!validStatuses.includes(options.status as PlanStatus)) {
      return failure(
        t('plan.create.error.invalidStatus', { status: options.status }),
        ExitCode.VALIDATION
      );
    }
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    const input: CreatePlanInput = {
      title: options.title,
      createdBy: actor,
      status: (options.status as PlanStatus) ?? PlanStatus.DRAFT,
      ...(tags && { tags }),
    };

    const plan = await createPlan(input);
    const created = await api.create(plan as unknown as Element & Record<string, unknown>);

    return success(created, t('plan.create.success', { id: created.id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.create.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planCreateCommand: Command = {
  name: 'create',
  description: t('plan.create.description'),
  usage: 'sf plan create --title <title> [options]',
  help: t('plan.create.help'),
  options: planCreateOptions,
  handler: planCreateHandler as Command['handler'],
};

// ============================================================================
// Plan List Command
// ============================================================================

interface PlanListOptions {
  status?: string;
  tag?: string[];
  limit?: string;
}

const planListOptions: CommandOption[] = [
  {
    name: 'status',
    short: 's',
    description: t('plan.list.option.status'),
    hasValue: true,
  },
  {
    name: 'tag',
    description: t('plan.list.option.tag'),
    hasValue: true,
    array: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function planListHandler(
  _args: string[],
  options: GlobalOptions & PlanListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'plan',
    };

    // Status filter
    if (options.status) {
      const validStatuses = Object.values(PlanStatus);
      if (!validStatuses.includes(options.status as PlanStatus)) {
        return failure(
          t('plan.error.invalidStatus', { status: options.status, valid: validStatuses.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      filter.status = options.status;
    }

    // Tag filter
    if (options.tag) {
      filter.tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Plan>(filter);

    // Post-filter by status since the API doesn't filter by status for plans
    let items = result.items;
    if (options.status) {
      items = items.filter((p) => p.status === options.status);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((p) => p.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, t('plan.list.empty'));
    }

    // Build table with progress info
    const headers = [t('label.id'), t('label.title'), t('label.status'), t('label.progress'), t('label.created')];
    const rows: string[][] = [];

    for (const plan of items) {
      // Get progress for each plan
      let progressStr = '-';
      try {
        const progress = await api.getPlanProgress(plan.id);
        progressStr = `${progress.completionPercentage}% (${progress.completedTasks}/${progress.totalTasks})`;
      } catch {
        // Ignore progress fetch errors
      }

      const status = `${getStatusIcon(plan.status)} ${plan.status}`;
      const created = plan.createdAt.split('T')[0];
      rows.push([plan.id, plan.title, status, progressStr, created]);
    }

    const table = formatter.table(headers, rows);
    const summary = `\n${t('plan.list.summary', { shown: items.length, total: result.total })}`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.list.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planListCommand: Command = {
  name: 'list',
  description: t('plan.list.description'),
  usage: 'sf plan list [options]',
  help: t('plan.list.help'),
  options: planListOptions,
  handler: planListHandler as Command['handler'],
};

// ============================================================================
// Plan Show Command
// ============================================================================

interface PlanShowOptions {
  tasks?: boolean;
}

const planShowOptions: CommandOption[] = [
  {
    name: 'tasks',
    short: 't',
    description: t('plan.show.option.tasks'),
    hasValue: false,
  },
];

async function planShowHandler(
  args: string[],
  options: GlobalOptions & PlanShowOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('plan.show.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const plan = await api.get<Plan>(id as ElementId);

    if (!plan) {
      return failure(t('plan.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (plan.type !== 'plan') {
      return failure(t('plan.error.notPlan', { id, type: plan.type }), ExitCode.VALIDATION);
    }

    // Get progress
    const progress = await api.getPlanProgress(id as ElementId);

    // Get tasks if requested
    let tasks: Task[] | undefined;
    if (options.tasks) {
      tasks = await api.getTasksInPlan(id as ElementId);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success({ plan, progress, ...(tasks && { tasks }) });
    }

    if (mode === 'quiet') {
      return success(plan.id);
    }

    // Human-readable output
    let output = formatter.element(plan as unknown as Record<string, unknown>);

    // Add progress section
    output += `\n\n${t('plan.show.taskProgress')}\n`;
    output += `${t('label.total')}:       ${progress.totalTasks}\n`;
    output += `${t('label.completed')}:   ${progress.completedTasks}\n`;
    output += `${t('label.inProgress')}: ${progress.inProgressTasks}\n`;
    output += `${t('label.blocked')}:     ${progress.blockedTasks}\n`;
    output += `${t('label.ready')}:       ${progress.remainingTasks}\n`;
    output += `${t('label.progress')}:    ${progress.completionPercentage}%`;

    // Add tasks section if requested
    if (tasks && tasks.length > 0) {
      output += `\n\n${t('plan.show.tasksSection')}\n`;
      const taskHeaders = [t('label.id'), t('label.title'), t('label.status'), t('label.priority')];
      const taskRows = tasks.map((t) => [
        t.id,
        t.title.length > 40 ? t.title.substring(0, 37) + '...' : t.title,
        `${getStatusIcon(t.status)} ${t.status}`,
        `P${t.priority ?? 3}`,
      ]);
      output += formatter.table(taskHeaders, taskRows);
    } else if (options.tasks) {
      output += `\n\n${t('plan.show.tasksSection')}\n${t('plan.show.noTasks')}`;
    }

    return success({ plan, progress }, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.show.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planShowCommand: Command = {
  name: 'show',
  description: t('plan.show.description'),
  usage: 'sf plan show <id> [options]',
  help: t('plan.show.help'),
  options: planShowOptions,
  handler: planShowHandler as Command['handler'],
};

// ============================================================================
// Plan Activate Command
// ============================================================================

async function planActivateHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('plan.activate.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const plan = await api.get<Plan>(id as ElementId);

    if (!plan) {
      return failure(t('plan.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (plan.type !== 'plan') {
      return failure(t('plan.error.notPlan', { id, type: plan.type }), ExitCode.VALIDATION);
    }

    if (plan.status === PlanStatus.ACTIVE) {
      return success(plan, t('plan.activate.alreadyActive', { id }));
    }

    if (plan.status !== PlanStatus.DRAFT) {
      return failure(
        t('plan.activate.error.wrongStatus', { status: plan.status }),
        ExitCode.VALIDATION
      );
    }

    const actor = resolveActor(options);
    const updated = await api.update<Plan>(id as ElementId, { status: PlanStatus.ACTIVE }, { actor });

    return success(updated, t('plan.activate.success', { id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.activate.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planActivateCommand: Command = {
  name: 'activate',
  description: t('plan.activate.description'),
  usage: 'sf plan activate <id>',
  help: t('plan.activate.help'),
  handler: planActivateHandler as Command['handler'],
};

// ============================================================================
// Plan Complete Command
// ============================================================================

async function planCompleteHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('plan.complete.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const plan = await api.get<Plan>(id as ElementId);

    if (!plan) {
      return failure(t('plan.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (plan.type !== 'plan') {
      return failure(t('plan.error.notPlan', { id, type: plan.type }), ExitCode.VALIDATION);
    }

    if (plan.status === PlanStatus.COMPLETED) {
      return success(plan, t('plan.complete.alreadyCompleted', { id }));
    }

    if (plan.status !== PlanStatus.ACTIVE) {
      return failure(
        t('plan.complete.error.wrongStatus', { status: plan.status }),
        ExitCode.VALIDATION
      );
    }

    const actor = resolveActor(options);
    const now = new Date().toISOString();
    const updated = await api.update<Plan>(
      id as ElementId,
      { status: PlanStatus.COMPLETED, completedAt: now },
      { actor }
    );

    return success(updated, t('plan.complete.success', { id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.complete.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planCompleteCommand: Command = {
  name: 'complete',
  description: t('plan.complete.description'),
  usage: 'sf plan complete <id>',
  help: t('plan.complete.help'),
  handler: planCompleteHandler as Command['handler'],
};

// ============================================================================
// Plan Cancel Command
// ============================================================================

interface PlanCancelOptions {
  reason?: string;
}

const planCancelOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: t('plan.cancel.option.reason'),
    hasValue: true,
  },
];

async function planCancelHandler(
  args: string[],
  options: GlobalOptions & PlanCancelOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('plan.cancel.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const plan = await api.get<Plan>(id as ElementId);

    if (!plan) {
      return failure(t('plan.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    if (plan.type !== 'plan') {
      return failure(t('plan.error.notPlan', { id, type: plan.type }), ExitCode.VALIDATION);
    }

    if (plan.status === PlanStatus.CANCELLED) {
      return success(plan, t('plan.cancel.alreadyCancelled', { id }));
    }

    if (plan.status === PlanStatus.COMPLETED) {
      return failure(
        t('plan.cancel.error.completedCannotCancel', { status: plan.status }),
        ExitCode.VALIDATION
      );
    }

    const actor = resolveActor(options);
    const now = new Date().toISOString();
    const updates: Partial<Plan> = {
      status: PlanStatus.CANCELLED,
      cancelledAt: now,
    };
    if (options.reason) {
      updates.cancelReason = options.reason;
    }

    const updated = await api.update<Plan>(id as ElementId, updates, { actor });

    return success(updated, t('plan.cancel.success', { id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.cancel.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planCancelCommand: Command = {
  name: 'cancel',
  description: t('plan.cancel.description'),
  usage: 'sf plan cancel <id> [options]',
  help: t('plan.cancel.help'),
  options: planCancelOptions,
  handler: planCancelHandler as Command['handler'],
};

// ============================================================================
// Plan Add Task Command
// ============================================================================

async function planAddTaskHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [planId, taskId] = args;

  if (!planId || !taskId) {
    return failure(t('plan.addTask.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify plan exists
    const plan = await api.get<Plan>(planId as ElementId);
    if (!plan) {
      return failure(t('plan.error.notFound', { id: planId }), ExitCode.NOT_FOUND);
    }
    if (plan.type !== 'plan') {
      return failure(t('plan.error.notPlan', { id: planId, type: plan.type }), ExitCode.VALIDATION);
    }
    if (plan.status === PlanStatus.CANCELLED) {
      return failure(
        t('plan.addTask.error.cancelledPlan'),
        ExitCode.VALIDATION
      );
    }

    // Verify task exists
    const task = await api.get<Task>(taskId as ElementId);
    if (!task) {
      return failure(t('plan.addTask.error.taskNotFound', { id: taskId }), ExitCode.NOT_FOUND);
    }
    if (task.type !== 'task') {
      return failure(t('plan.addTask.error.notTask', { id: taskId, type: task.type }), ExitCode.VALIDATION);
    }

    const actor = resolveActor(options);
    await api.addTaskToPlan(taskId as ElementId, planId as ElementId, { actor });

    return success({ planId, taskId }, t('plan.addTask.success', { taskId, planId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.addTask.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planAddTaskCommand: Command = {
  name: 'add-task',
  description: t('plan.addTask.description'),
  usage: 'sf plan add-task <plan-id> <task-id>',
  help: t('plan.addTask.help'),
  handler: planAddTaskHandler as Command['handler'],
};

// ============================================================================
// Plan Remove Task Command
// ============================================================================

async function planRemoveTaskHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [planId, taskId] = args;

  if (!planId || !taskId) {
    return failure(t('plan.removeTask.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    await api.removeTaskFromPlan(taskId as ElementId, planId as ElementId, actor);

    return success({ planId, taskId }, t('plan.removeTask.success', { taskId, planId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.removeTask.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planRemoveTaskCommand: Command = {
  name: 'remove-task',
  description: t('plan.removeTask.description'),
  usage: 'sf plan remove-task <plan-id> <task-id>',
  help: t('plan.removeTask.help'),
  handler: planRemoveTaskHandler as Command['handler'],
};

// ============================================================================
// Plan Tasks Command
// ============================================================================

interface PlanTasksOptions {
  status?: string;
  limit?: string;
}

const planTasksOptions: CommandOption[] = [
  {
    name: 'status',
    short: 's',
    description: t('plan.tasks.option.status'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function planTasksHandler(
  args: string[],
  options: GlobalOptions & PlanTasksOptions
): Promise<CommandResult> {
  const [planId] = args;

  if (!planId) {
    return failure(t('plan.tasks.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: TaskFilter = {};

    if (options.status) {
      filter.status = options.status as TaskFilter['status'];
    }

    let limit: number | undefined;
    if (options.limit) {
      limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
    }

    let tasks = await api.getTasksInPlan(planId as ElementId, filter);

    // Apply limit (since getTasksInPlan doesn't support pagination directly)
    if (limit !== undefined && tasks.length > limit) {
      tasks = tasks.slice(0, limit);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    if (tasks.length === 0) {
      return success(null, t('plan.tasks.empty'));
    }

    const headers = [t('label.id'), t('label.title'), t('label.status'), t('label.priority'), t('label.assignee')];
    const rows = tasks.map((t) => [
      t.id,
      t.title.length > 40 ? t.title.substring(0, 37) + '...' : t.title,
      `${getStatusIcon(t.status)} ${t.status}`,
      `P${t.priority ?? 3}`,
      t.assignee ?? '-',
    ]);

    const table = formatter.table(headers, rows);
    return success(tasks, table + `\n${t('plan.tasks.summary', { count: tasks.length })}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.tasks.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planTasksCommand: Command = {
  name: 'tasks',
  description: t('plan.tasks.description'),
  usage: 'sf plan tasks <plan-id> [options]',
  help: t('plan.tasks.help'),
  options: planTasksOptions,
  handler: planTasksHandler as Command['handler'],
};

// ============================================================================
// Plan Auto-Complete Command
// ============================================================================

interface PlanAutoCompleteOptions {
  dryRun?: boolean;
}

const planAutoCompleteOptions: CommandOption[] = [
  {
    name: 'dry-run',
    description: t('plan.autoComplete.option.dryRun'),
    hasValue: false,
  },
];

async function planAutoCompleteHandler(
  _args: string[],
  options: GlobalOptions & PlanAutoCompleteOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const isDryRun = !!(options as Record<string, unknown>)['dry-run'] || !!options.dryRun;

  try {
    const actor = resolveActor(options);

    // 1. List all active plans
    const allPlans = await api.list<Plan>({ type: 'plan' });
    const activePlans = allPlans.filter((p) => p.status === PlanStatus.ACTIVE);

    if (activePlans.length === 0) {
      return success(
        { checked: 0, autoCompleted: [], skipped: [], dryRun: isDryRun },
        t('plan.autoComplete.noActivePlans')
      );
    }

    // 2. Check each active plan for auto-completion eligibility
    const autoCompleted: Array<{ id: string; title: string }> = [];
    const skipped: Array<{ id: string; title: string; reason: string }> = [];

    for (const plan of activePlans) {
      try {
        // Get tasks and build status counts
        const tasks = await api.getTasksInPlan(plan.id, { includeDeleted: false });

        const statusCounts: Record<string, number> = {
          [TaskStatus.OPEN]: 0,
          [TaskStatus.IN_PROGRESS]: 0,
          [TaskStatus.BLOCKED]: 0,
          [TaskStatus.CLOSED]: 0,
          [TaskStatus.DEFERRED]: 0,
          [TaskStatus.TOMBSTONE]: 0,
        };

        for (const task of tasks) {
          if (task.status in statusCounts) {
            statusCounts[task.status]++;
          }
        }

        // 3. Check if plan can be auto-completed
        if (canAutoComplete(statusCounts as Record<TaskStatus, number>)) {
          if (!isDryRun) {
            const now = new Date().toISOString();
            await api.update<Plan>(
              plan.id,
              { status: PlanStatus.COMPLETED, completedAt: now },
              { actor }
            );
          }
          autoCompleted.push({ id: plan.id, title: plan.title });
        } else {
          const nonClosed = tasks.filter((t) => t.status !== TaskStatus.CLOSED);
          const reason =
            tasks.length === 0
              ? t('plan.autoComplete.reason.noTasks')
              : t('plan.autoComplete.reason.nonClosedTasks', { count: nonClosed.length });
          skipped.push({ id: plan.id, title: plan.title, reason });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        skipped.push({ id: plan.id, title: plan.title, reason: t('plan.autoComplete.reason.error', { message }) });
      }
    }

    // 4. Build summary output
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ checked: activePlans.length, autoCompleted, skipped, dryRun: isDryRun });
    }

    const prefix = isDryRun ? t('plan.autoComplete.dryRunPrefix') : '';
    let output = `${prefix}${t('plan.autoComplete.sweepTitle')}\n`;
    output += `${'─'.repeat(40)}\n`;
    output += `${t('plan.autoComplete.checked', { count: activePlans.length })}\n`;
    output += `${t('plan.autoComplete.autoCompletedCount', { count: autoCompleted.length })}\n`;

    if (autoCompleted.length > 0) {
      output += `\n${isDryRun ? t('plan.autoComplete.wouldAutoComplete') : t('plan.autoComplete.autoCompletedLabel')}:\n`;
      for (const plan of autoCompleted) {
        output += `  ✓ ${plan.id}  ${plan.title}\n`;
      }
    }

    if (autoCompleted.length === 0) {
      output += `\n${t('plan.autoComplete.notEligible')}`;
    }

    return success(
      { checked: activePlans.length, autoCompleted, skipped, dryRun: isDryRun },
      output
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('plan.autoComplete.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const planAutoCompleteCommand: Command = {
  name: 'auto-complete',
  description: t('plan.autoComplete.description'),
  usage: 'sf plan auto-complete [options]',
  help: t('plan.autoComplete.help'),
  options: planAutoCompleteOptions,
  handler: planAutoCompleteHandler as Command['handler'],
};

// ============================================================================
// Plan Root Command
// ============================================================================

export const planCommand: Command = {
  name: 'plan',
  description: t('plan.description'),
  usage: 'sf plan <subcommand> [options]',
  help: t('plan.help'),
  subcommands: {
    create: planCreateCommand,
    list: planListCommand,
    show: planShowCommand,
    activate: planActivateCommand,
    complete: planCompleteCommand,
    cancel: planCancelCommand,
    'add-task': planAddTaskCommand,
    'remove-task': planRemoveTaskCommand,
    tasks: planTasksCommand,
    'auto-complete': planAutoCompleteCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: planCreateCommand,
    add: planCreateCommand,
    ls: planListCommand,
    get: planShowCommand,
    view: planShowCommand,
    sweep: planAutoCompleteCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return planListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(planCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = t('error.unknownSubcommand', { subcommand: args[0] });
    if (suggestions.length > 0) {
      msg += `\n\n${t('error.didYouMean')}\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\n' + t('error.runHelp', { command: 'sf plan' });
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
