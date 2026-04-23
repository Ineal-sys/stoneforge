/**
 * CRUD Commands - Create, List, Show, Update, Delete operations
 *
 * Provides CLI commands for basic element operations:
 * - create: Create new elements (tasks, etc.)
 * - list: List elements with filtering
 * - show: Show detailed element information
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';
import { getFormatter, getOutputMode, getStatusIcon, formatEventsTable, type EventData } from '../formatter.js';
import { createTask, createDocument, ContentType, TaskStatus, TaskTypeValue, PlanStatus, type CreateTaskInput, type Priority, type Complexity, type Plan, type DocumentId, type HydratedMessage } from '@stoneforge/core';
import type { Element, ElementId, EntityId, Task, Document, SyncDirection } from '@stoneforge/core';
import type { QuarryAPI, TaskFilter } from '../../api/types.js';
import type { PlanProgress } from '@stoneforge/core';
import type { StorageBackend } from '@stoneforge/storage';
import { createInboxService } from '../../services/inbox.js';
import { resolveDatabasePath, resolveActor, createAPI } from '../db.js';
import { getValue } from '../../config/index.js';
import { autoLinkTask } from '../../external-sync/auto-link.js';
import { tryCreateProviderForAutoLink } from './auto-link-helper.js';

// ============================================================================
// Create Command
// ============================================================================

interface CreateOptions {
  title?: string;
  name?: string; // Alias for title
  priority?: string;
  complexity?: string;
  type?: string;
  assignee?: string;
  tag?: string[];
  plan?: string;
  description?: string;
  'no-auto-link'?: boolean;
}

export const createOptions: CommandOption[] = [
  {
    name: 'title',
    short: 't',
    description: t('create.option.title'),
    hasValue: true,
  },
  {
    name: 'name',
    short: 'n',
    description: t('create.option.name'),
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: t('create.option.priority'),
    hasValue: true,
  },
  {
    name: 'complexity',
    short: 'c',
    description: t('create.option.complexity'),
    hasValue: true,
  },
  {
    name: 'type',
    description: t('create.option.type'),
    hasValue: true,
  },
  {
    name: 'assignee',
    short: 'a',
    description: t('create.option.assignee'),
    hasValue: true,
  },
  {
    name: 'tag',
    description: t('create.option.tag'),
    hasValue: true,
    array: true,
  },
  {
    name: 'plan',
    description: t('create.option.plan'),
    hasValue: true,
  },
  {
    name: 'description',
    short: 'd',
    description: t('create.option.description'),
    hasValue: true,
  },
  {
    name: 'no-auto-link',
    description: t('create.option.noAutoLink'),
  },
];

export async function createHandler(
  args: string[],
  options: GlobalOptions & CreateOptions
): Promise<CommandResult> {
  // First argument is the element type
  const [elementType] = args;

  if (!elementType) {
    return failure(t('create.error.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  // Currently only support task creation
  if (elementType !== 'task') {
    return failure(
      t('create.error.unsupportedType', { type: elementType }),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  // Use --name as alias for --title
  const title = options.title ?? options.name;

  // Validate required options for task
  if (!title) {
    return failure(t('create.error.titleRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  // Create command should create the database if it doesn't exist
  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Parse priority
    let priority: Priority | undefined;
    if (options.priority) {
      const p = parseInt(options.priority, 10);
      if (isNaN(p) || p < 1 || p > 5) {
        return failure(t('label.error.priorityRange'), ExitCode.VALIDATION);
      }
      priority = p as Priority;
    }

    // Parse complexity
    let complexity: Complexity | undefined;
    if (options.complexity) {
      const c = parseInt(options.complexity, 10);
      if (isNaN(c) || c < 1 || c > 5) {
        return failure(t('label.error.complexityRange'), ExitCode.VALIDATION);
      }
      complexity = c as Complexity;
    }

    // Parse task type
    type TaskTypeValueType = (typeof TaskTypeValue)[keyof typeof TaskTypeValue];
    let taskType: TaskTypeValueType | undefined;
    if (options.type) {
      const validTypes: string[] = Object.values(TaskTypeValue);
      if (!validTypes.includes(options.type)) {
        return failure(
          t('create.error.invalidTaskType', { type: options.type, valid: validTypes.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      taskType = options.type as TaskTypeValueType;
    }

    // Handle tags (may come as array if --tag is specified multiple times)
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Handle description: create a document and link it to the task
    let descriptionRef: DocumentId | undefined;
    if (options.description) {
      const docInput = {
        content: options.description,
        contentType: ContentType.MARKDOWN,
        createdBy: actor,
      };
      const idConfig = api.getIdGeneratorConfig();
      const newDoc = await createDocument(docInput, idConfig);
      const createdDoc = await api.create(newDoc as unknown as Element & Record<string, unknown>);
      descriptionRef = createdDoc.id as DocumentId;
    }

    // Create task input (title is guaranteed non-null from validation above)
    const input: CreateTaskInput = {
      title: title!,
      createdBy: actor,
      ...(priority !== undefined && { priority }),
      ...(complexity !== undefined && { complexity }),
      ...(taskType !== undefined && { taskType }),
      ...(options.assignee && { assignee: options.assignee as EntityId }),
      ...(tags && { tags }),
      ...(descriptionRef !== undefined && { descriptionRef }),
    };

    // Create the task
    const task = await createTask(input, api.getIdGeneratorConfig());
    // The API's create method expects ElementInput which Task satisfies
    const created = await api.create(task as unknown as Element & Record<string, unknown>);

    // If --plan is provided, attach the task to the plan
    let planWarning: string | undefined;
    if (options.plan) {
      try {
        // First try to find by ID (if it looks like an element ID)
        let plan: Plan | null = null;
        if (options.plan.startsWith('el-') || options.plan.match(/^el[a-z0-9]+$/i)) {
          plan = await api.get<Plan>(options.plan as ElementId);
        }

        // If not found by ID, search by title
        if (!plan) {
          const plans = await api.list<Plan>({ type: 'plan' });
          plan = plans.find((p) => p.title === options.plan) ?? null;
        }

        if (!plan) {
          planWarning = t('create.warning.planNotFound', { plan: options.plan });
        } else if (plan.type !== 'plan') {
          planWarning = t('create.warning.notAPlan', { plan: options.plan, type: plan.type });
        } else if (plan.status === PlanStatus.CANCELLED) {
          planWarning = t('create.warning.planCancelled', { id: plan.id });
        } else {
          await api.addTaskToPlan(created.id, plan.id, { actor });
        }
      } catch (attachErr) {
        const attachMessage = attachErr instanceof Error ? attachErr.message : String(attachErr);
        planWarning = t('create.warning.attachFailed', { message: attachMessage });
      }
    }

    // Auto-link to external provider if configured and not suppressed
    let autoLinkMessage: string | undefined;
    if (!options['no-auto-link']) {
      const autoLink = getValue('externalSync.autoLink');
      const autoLinkProvider = getValue('externalSync.autoLinkProvider');

      if (autoLink && autoLinkProvider) {
        const providerResult = await tryCreateProviderForAutoLink(autoLinkProvider, options);

        if (providerResult.provider && providerResult.project) {
          const direction = getValue('externalSync.defaultDirection') as SyncDirection;
          const linkResult = await autoLinkTask({
            task: created as unknown as Task,
            api,
            provider: providerResult.provider,
            project: providerResult.project,
            direction,
          });

          if (linkResult.success && linkResult.syncState) {
            autoLinkMessage = t('create.success.linked', { provider: autoLinkProvider, url: linkResult.syncState.url });
          } else if (!linkResult.success) {
            autoLinkMessage = t('create.warning.autoLinkFailed', { error: linkResult.error });
          }
        } else if (providerResult.error) {
          autoLinkMessage = t('create.warning.autoLinkFailed', { error: providerResult.error });
        }
      }
    }

    const messageParts = [t('create.success.created', { id: created.id })];
    if (planWarning) messageParts.push(planWarning);
    if (autoLinkMessage) messageParts.push(autoLinkMessage);
    return success(created, messageParts.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('create.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const createCommand: Command = {
  name: 'create',
  description: t('create.description'),
  usage: 'sf create <type> [options]',
  help: t('create.help'),
  options: createOptions,
  handler: createHandler as Command['handler'],
};

// ============================================================================
// List Command
// ============================================================================

interface ListOptions {
  type?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  tag?: string[];
  limit?: string;
  offset?: string;
}

export const listOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: t('list.option.type'),
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: t('list.option.status'),
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: t('list.option.priority'),
    hasValue: true,
  },
  {
    name: 'assignee',
    short: 'a',
    description: t('list.option.assignee'),
    hasValue: true,
  },
  {
    name: 'tag',
    description: t('list.option.tag'),
    hasValue: true,
    array: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('list.option.limit'),
    hasValue: true,
  },
  {
    name: 'offset',
    short: 'o',
    description: t('list.option.offset'),
    hasValue: true,
  },
];

/**
 * Query the blocked_cache table to get IDs of all currently blocked elements.
 * Used to compute effective display status for tasks — open tasks with
 * unresolved blocking dependencies should display as 'blocked'.
 */
function getBlockedIds(backend: StorageBackend): Set<string> {
  try {
    const rows = backend.query<{ element_id: string }>(
      'SELECT element_id FROM blocked_cache'
    );
    return new Set(rows.map((r) => r.element_id));
  } catch {
    // blocked_cache table may not exist in all scenarios
    return new Set();
  }
}

/**
 * Compute the effective display status for an element.
 * Tasks with an 'open' stored status that appear in the blocked_cache
 * are displayed as 'blocked' instead.
 */
function getEffectiveStatus(status: string, elementId: string, blockedIds: Set<string>): string {
  if (status === 'open' && blockedIds.has(elementId)) {
    return 'blocked';
  }
  return status;
}

export async function listHandler(
  args: string[],
  options: GlobalOptions & ListOptions
): Promise<CommandResult> {
  const { api, backend, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter from options
    const filter: TaskFilter = {};

    // Type filter (can also be first positional arg)
    const typeArg = args[0] ?? options.type;
    if (typeArg) {
      filter.type = typeArg as Element['type'];
    }

    // Status filter
    if (options.status) {
      const validStatuses: string[] = Object.values(TaskStatus);
      // Also accept 'blocked' as a valid filter value (computed status)
      if (!validStatuses.includes(options.status) && options.status !== 'blocked') {
        return failure(
          t('list.error.invalidStatus', { status: options.status, valid: validStatuses.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      // For 'blocked' filter, we query 'open' tasks and filter by blocked_cache below
      if (options.status !== 'blocked') {
        filter.status = options.status as (typeof TaskStatus)[keyof typeof TaskStatus];
      }
    }

    // Priority filter
    if (options.priority) {
      const priority = parseInt(options.priority, 10);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        return failure(t('label.error.priorityRange'), ExitCode.VALIDATION);
      }
      filter.priority = priority as 1 | 2 | 3 | 4 | 5;
    }

    // Assignee filter
    if (options.assignee) {
      filter.assignee = options.assignee as EntityId;
    }

    // Tag filter
    if (options.tag) {
      filter.tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Pagination
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('list.error.limitPositive'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    if (options.offset) {
      const offset = parseInt(options.offset, 10);
      if (isNaN(offset) || offset < 0) {
        return failure(t('list.error.offsetNonNegative'), ExitCode.VALIDATION);
      }
      filter.offset = offset;
    }

    // Query elements
    const result = await api.listPaginated<Element>(filter);

    // Get blocked element IDs for computing effective display status
    const blockedIds = getBlockedIds(backend);

    // If filtering by 'blocked' status, only show open tasks that are in blocked_cache
    let items = result.items;
    if (options.status === 'blocked') {
      items = items.filter((item) => {
        const data = item as unknown as Record<string, unknown>;
        return data.status === 'open' && blockedIds.has(item.id);
      });
    }

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((e) => e.id).join('\n'));
    }

    // Human-readable output
    if (items.length === 0) {
      return success(null, t('list.success.noElements'));
    }

    // Sort by priority ASC for tasks (P1 is highest priority, comes first)
    const sortedItems = [...items].sort((a, b) => {
      const dataA = a as unknown as Record<string, unknown>;
      const dataB = b as unknown as Record<string, unknown>;
      const priorityA = typeof dataA.priority === 'number' ? dataA.priority : 999;
      const priorityB = typeof dataB.priority === 'number' ? dataB.priority : 999;
      return priorityA - priorityB;
    });

    // Build table data with priority and assignee columns
    const headers = [t('label.id'), t('label.type'), t('label.titleName'), t('label.status'), t('label.priority'), t('label.assignee'), t('label.created')];
    const rows = sortedItems.map((item) => {
      const data = item as unknown as Record<string, unknown>;
      const title = data.title ?? data.name ?? '-';
      // Compute effective display status (show 'blocked' for open tasks with unresolved dependencies)
      const effectiveStatus = data.status
        ? getEffectiveStatus(data.status as string, item.id, blockedIds)
        : null;
      const status = effectiveStatus ? `${getStatusIcon(effectiveStatus)} ${effectiveStatus}` : '-';
      const priority = typeof data.priority === 'number' ? `P${data.priority}` : '-';
      const assignee = typeof data.assignee === 'string' ? data.assignee : '-';
      const created = item.createdAt.split('T')[0];
      return [item.id, item.type, title, status, priority, assignee, created];
    });

    const table = formatter.table(headers, rows);
    const summary = t('list.success.showing', { count: items.length, total: result.total });

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('list.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const listCommand: Command = {
  name: 'list',
  description: t('list.description'),
  usage: 'sf list [type] [options]',
  help: t('list.help'),
  options: listOptions,
  handler: listHandler as Command['handler'],
};

// ============================================================================
// Show Command
// ============================================================================

interface ShowOptions {
  events?: boolean;
  'events-limit'?: string;
}

export const showOptions: CommandOption[] = [
  {
    name: 'events',
    short: 'e',
    description: t('show.option.events'),
    hasValue: false,
  },
  {
    name: 'events-limit',
    description: t('show.option.eventsLimit'),
    hasValue: true,
  },
];

export async function showHandler(
  args: string[],
  options: GlobalOptions & ShowOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('show.error.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, backend, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Handle inbox item IDs (e.g., inbox-abc123)
    if (id.startsWith('inbox-')) {
      const inboxService = createInboxService(backend);
      const inboxItem = inboxService.getInboxItem(id);

      if (!inboxItem) {
        return failure(t('show.error.inboxNotFound', { id }), ExitCode.NOT_FOUND);
      }

      // Fetch the associated message with hydrated content
      const message = await api.get<HydratedMessage>(inboxItem.messageId as unknown as ElementId, {
        hydrate: { content: true }
      });

      // Build a combined result with inbox item info and message content
      const result = {
        ...inboxItem,
        messageContent: message?.content ?? null,
        messageSender: message?.sender ?? null,
      };

      const mode = getOutputMode(options);
      const formatter = getFormatter(mode);

      if (mode === 'json') {
        return success(result);
      }

      if (mode === 'quiet') {
        return success(inboxItem.id);
      }

      // Human-readable output
      const output = formatter.element(result as unknown as Record<string, unknown>);
      return success(result, output);
    }

    // Get the element
    const element = await api.get<Element>(id as ElementId);

    if (!element) {
      return failure(t('label.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    // Check if element is deleted (tombstone)
    const data = element as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(t('label.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    // Get events if requested
    let events: unknown[] | undefined;
    if (options.events) {
      const eventsLimit = options['events-limit'] ? parseInt(options['events-limit'], 10) : 10;
      events = await api.getEvents(id as ElementId, { limit: eventsLimit });
    }

    // Get plan progress if element is a plan
    let planProgress: PlanProgress | undefined;
    if (element.type === 'plan') {
      try {
        planProgress = await api.getPlanProgress(id as ElementId);
      } catch {
        // Ignore errors fetching progress
      }
    }

    if (mode === 'json') {
      if (events || planProgress) {
        return success({ element, ...(planProgress && { progress: planProgress }), ...(events && { events }) });
      }
      return success(element);
    }

    if (mode === 'quiet') {
      return success(element.id);
    }

    // Human-readable output - format as key-value pairs
    // Compute effective display status for tasks (show 'blocked' for open tasks with unresolved deps)
    const blockedIds = getBlockedIds(backend);
    const displayElement = { ...element as unknown as Record<string, unknown> };
    if (typeof displayElement.status === 'string') {
      displayElement.status = getEffectiveStatus(displayElement.status, element.id, blockedIds);
    }
    let output = formatter.element(displayElement);

    // Add plan progress if available
    if (planProgress) {
      output += '\n\n--- ' + t('show.taskProgress') + ' ---\n';
      output += `${t('show.label.total')}:       ${planProgress.totalTasks}\n`;
      output += `${t('show.label.completed')}:   ${planProgress.completedTasks}\n`;
      output += `${t('show.label.inProgress')}: ${planProgress.inProgressTasks}\n`;
      output += `${t('show.label.blocked')}:     ${planProgress.blockedTasks}\n`;
      output += `${t('show.label.ready')}:       ${planProgress.remainingTasks}\n`;
      output += `${t('show.label.progress')}:    ${planProgress.completionPercentage}%`;
    }

    // Add events if requested
    if (events && events.length > 0) {
      output += '\n\n--- ' + t('show.recentEvents') + ' ---\n';
      output += formatEventsTable(events as EventData[]);
    } else if (options.events) {
      output += '\n\n--- ' + t('show.recentEvents') + ' ---\n' + t('show.noEvents');
    }

    return success(element, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('show.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const showCommand: Command = {
  name: 'show',
  description: t('show.description'),
  usage: 'sf show <id> [options]',
  help: t('show.help'),
  options: showOptions,
  handler: showHandler as Command['handler'],
};

// ============================================================================
// Update Command
// ============================================================================

interface UpdateOptions {
  title?: string;
  priority?: string;
  complexity?: string;
  status?: string;
  assignee?: string;
  description?: string;
  metadata?: string;
  tag?: string[];
  'add-tag'?: string[];
  'remove-tag'?: string[];
}

export const updateOptions: CommandOption[] = [
  {
    name: 'title',
    short: 't',
    description: t('update.option.title'),
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: t('update.option.priority'),
    hasValue: true,
  },
  {
    name: 'complexity',
    short: 'c',
    description: t('update.option.complexity'),
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: t('update.option.status'),
    hasValue: true,
  },
  {
    name: 'assignee',
    short: 'a',
    description: t('update.option.assignee'),
    hasValue: true,
  },
  {
    name: 'description',
    short: 'd',
    description: t('update.option.description'),
    hasValue: true,
  },
  {
    name: 'metadata',
    description: t('update.option.metadata'),
    hasValue: true,
  },
  {
    name: 'tag',
    description: t('update.option.tag'),
    hasValue: true,
    array: true,
  },
  {
    name: 'add-tag',
    description: t('update.option.addTag'),
    hasValue: true,
    array: true,
  },
  {
    name: 'remove-tag',
    description: t('update.option.removeTag'),
    hasValue: true,
    array: true,
  },
];

export async function updateHandler(
  args: string[],
  options: GlobalOptions & UpdateOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('update.error.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get existing element
    const element = await api.get<Element>(id as ElementId);
    if (!element) {
      return failure(t('label.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    // Check if element is deleted (tombstone)
    const elemData = element as unknown as Record<string, unknown>;
    if (elemData.status === 'tombstone' || elemData.deletedAt) {
      return failure(t('label.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    // Resolve actor for audit trail
    const actor = resolveActor(options);

    // Build updates object
    const updates: Record<string, unknown> = {};

    // Handle title
    if (options.title !== undefined) {
      updates.title = options.title;
    }

    // Handle priority (for tasks)
    if (options.priority !== undefined) {
      if (element.type !== 'task') {
        return failure(t('update.error.priorityTaskOnly'), ExitCode.VALIDATION);
      }
      const p = parseInt(options.priority, 10);
      if (isNaN(p) || p < 1 || p > 5) {
        return failure(t('label.error.priorityRange'), ExitCode.VALIDATION);
      }
      updates.priority = p as Priority;
    }

    // Handle complexity (for tasks)
    if (options.complexity !== undefined) {
      if (element.type !== 'task') {
        return failure(t('update.error.complexityTaskOnly'), ExitCode.VALIDATION);
      }
      const c = parseInt(options.complexity, 10);
      if (isNaN(c) || c < 1 || c > 5) {
        return failure(t('label.error.complexityRange'), ExitCode.VALIDATION);
      }
      updates.complexity = c as Complexity;
    }

    // Handle status (for tasks)
    if (options.status !== undefined) {
      if (element.type !== 'task') {
        return failure(t('update.error.statusTaskOnly'), ExitCode.VALIDATION);
      }
      const validStatuses: string[] = Object.values(TaskStatus);
      if (!validStatuses.includes(options.status)) {
        return failure(
          t('update.error.invalidStatus', { status: options.status, valid: validStatuses.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      updates.status = options.status;
    }

    // Handle assignee (for tasks)
    if (options.assignee !== undefined) {
      if (element.type !== 'task') {
        return failure(t('update.error.assigneeTaskOnly'), ExitCode.VALIDATION);
      }
      // Empty string means unassign
      updates.assignee = options.assignee === '' ? undefined : (options.assignee as EntityId);
    }

    // Handle description
    let descriptionUpdated = false;
    if (options.description !== undefined) {
      if (element.type === 'task') {
        const task = element as unknown as Task;
        if (task.descriptionRef) {
          // Update existing description document
          const descDoc = await api.get<Document>(task.descriptionRef as unknown as ElementId);
          if (descDoc) {
            await api.update<Document>(task.descriptionRef as unknown as ElementId, {
              content: options.description,
            } as Partial<Document>);
          }
        } else {
          // Create new description document and link it
          const docInput = {
            content: options.description,
            contentType: ContentType.MARKDOWN,
            createdBy: actor,
          };
          const idConfig = api.getIdGeneratorConfig();
          const newDoc = await createDocument(docInput, idConfig);
          const createdDoc = await api.create(newDoc as unknown as Element & Record<string, unknown>);
          updates.descriptionRef = createdDoc.id as DocumentId;
        }
      } else if (element.type === 'document') {
        // For documents, update content directly
        updates.content = options.description;
      } else {
        // For other element types with a content field, update it directly
        const elemRecord = element as unknown as Record<string, unknown>;
        if ('content' in elemRecord) {
          updates.content = options.description;
        } else {
          return failure(
            t('update.error.noDescriptionSupport', { type: element.type }),
            ExitCode.VALIDATION
          );
        }
      }
      descriptionUpdated = true;
    }

    // Handle metadata
    if (options.metadata !== undefined) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(options.metadata);
      } catch {
        return failure(t('update.error.invalidMetadataJson'), ExitCode.VALIDATION);
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return failure(t('update.error.metadataNotObject'), ExitCode.VALIDATION);
      }

      // Merge into existing metadata, removing keys set to null
      const existingMetadata = { ...(element.metadata ?? {}) };
      for (const [key, value] of Object.entries(parsed)) {
        if (value === null) {
          delete existingMetadata[key];
        } else {
          existingMetadata[key] = value;
        }
      }
      updates.metadata = existingMetadata;
    }

    // Handle tag operations
    let currentTags = element.tags ?? [];

    // Complete replacement with --tag
    if (options.tag !== undefined) {
      const tags = Array.isArray(options.tag) ? options.tag : [options.tag];
      currentTags = tags;
    }

    // Add tags with --add-tag
    if (options['add-tag'] !== undefined) {
      const tagsToAdd = Array.isArray(options['add-tag']) ? options['add-tag'] : [options['add-tag']];
      const tagSet = new Set(currentTags);
      for (const tag of tagsToAdd) {
        tagSet.add(tag);
      }
      currentTags = Array.from(tagSet);
    }

    // Remove tags with --remove-tag
    if (options['remove-tag'] !== undefined) {
      const tagsToRemove = Array.isArray(options['remove-tag']) ? options['remove-tag'] : [options['remove-tag']];
      const removeSet = new Set(tagsToRemove);
      currentTags = currentTags.filter(tag => !removeSet.has(tag));
    }

    // Only update tags if any tag option was used
    if (options.tag !== undefined || options['add-tag'] !== undefined || options['remove-tag'] !== undefined) {
      updates.tags = currentTags;
    }

    // Check if there are any updates to apply
    if (Object.keys(updates).length === 0 && !descriptionUpdated) {
      return failure(t('update.error.noUpdates'), ExitCode.INVALID_ARGUMENTS);
    }

    // Apply the update with optimistic concurrency control (if there are field updates)
    let updated: Element;
    if (Object.keys(updates).length > 0) {
      updated = await api.update<Element>(id as ElementId, updates, {
        actor,
        expectedUpdatedAt: element.updatedAt,
      });
    } else {
      // Only side-effect updates (e.g., description on existing linked doc)
      updated = element;
    }

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    // Human-readable output
    const output = formatter.element(updated as unknown as Record<string, unknown>);
    return success(updated, t('update.success.updated', { type: element.type, id }) + `\n\n${output}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('update.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const updateCommand: Command = {
  name: 'update',
  description: t('update.description'),
  usage: 'sf update <id> [options]',
  help: t('update.help'),
  options: updateOptions,
  handler: updateHandler as Command['handler'],
};

// ============================================================================
// Delete Command
// ============================================================================

interface DeleteOptions {
  reason?: string;
  force?: boolean;
}

export const deleteOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: t('delete.option.reason'),
    hasValue: true,
  },
  {
    name: 'force',
    short: 'f',
    description: t('delete.option.force'),
  },
];

export async function deleteHandler(
  args: string[],
  options: GlobalOptions & DeleteOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('delete.error.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get existing element to verify it exists and get its type
    const element = await api.get<Element>(id as ElementId);
    if (!element) {
      return failure(t('label.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    // Check if element is already deleted (tombstone)
    const elemData = element as unknown as Record<string, unknown>;
    if (elemData.status === 'tombstone' || elemData.deletedAt) {
      return failure(t('label.error.notFound', { id }), ExitCode.NOT_FOUND);
    }

    // Check if element type supports deletion
    if (element.type === 'message') {
      return failure(t('delete.error.messagesImmutable'), ExitCode.VALIDATION);
    }

    // Resolve actor for audit trail
    const actor = resolveActor(options);

    // Perform the soft delete
    await api.delete(id as ElementId, { actor, reason: options.reason });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ id, deleted: true, type: element.type });
    }

    if (mode === 'quiet') {
      return success(id);
    }

    return success({ id, deleted: true }, t('delete.success.deleted', { type: element.type, id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('delete.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const deleteCommand: Command = {
  name: 'delete',
  description: t('delete.description'),
  usage: 'sf delete <id> [options]',
  help: t('delete.help'),
  options: deleteOptions,
  handler: deleteHandler as Command['handler'],
};
