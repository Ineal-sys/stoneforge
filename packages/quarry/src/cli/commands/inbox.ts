/**
 * Inbox Commands - Notification inbox management
 *
 * Provides CLI commands for inbox operations:
 * - inbox: List entity's inbox
 * - inbox read: Mark item as read
 * - inbox read-all: Mark all items as read
 * - inbox unread: Mark item as unread
 * - inbox archive: Archive inbox item
 * - inbox count: Get unread count
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';
import { getFormatter, getOutputMode, formatTimestamp } from '../formatter.js';
import { createInboxService, type InboxService } from '../../services/inbox.js';
import { InboxStatus, type InboxItem, type InboxFilter } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import type { StorageBackend } from '@stoneforge/storage';
import type { Entity, Document } from '@stoneforge/core';
import type { ElementId, EntityId } from '@stoneforge/core';
import type { Message, HydratedMessage } from '@stoneforge/core';
import { getValue, loadConfig } from '../../config/index.js';
import { createAPI } from '../db.js';

// ============================================================================
// Database Helper
// ============================================================================

interface APIAndBackend {
  api: QuarryAPI;
  inboxService: InboxService;
  backend: StorageBackend;
  error?: string;
}

/**
 * Creates an API instance and InboxService from options
 */
function createAPIAndInboxService(options: GlobalOptions): APIAndBackend {
  const { api, backend, error } = createAPI(options);
  if (error) {
    return {
      api: null as unknown as QuarryAPI,
      inboxService: null as unknown as InboxService,
      backend: null as unknown as StorageBackend,
      error,
    };
  }

  const inboxService = createInboxService(backend);
  return { api, inboxService, backend };
}

/**
 * Get the current actor from options or config
 */
function getActor(options: GlobalOptions): string {
  if (options.actor) {
    return options.actor;
  }
  loadConfig();
  return getValue('actor') || 'anonymous';
}

/**
 * Resolves an entity by ID or name.
 * If the value starts with 'el-', it's treated as an ID.
 * Otherwise, it's looked up by name.
 */
async function resolveEntity(api: QuarryAPI, idOrName: string): Promise<Entity | null> {
  if (idOrName.startsWith('el-')) {
    // Treat as ID
    return api.get<Entity>(idOrName as ElementId);
  }

  // Look up by name
  const entity = await api.lookupEntityByName(idOrName);
  return entity as Entity | null;
}

// ============================================================================
// Inbox List Command
// ============================================================================

interface InboxListOptions extends GlobalOptions {
  all?: boolean;
  status?: string;
  limit?: string;
  full?: boolean;
}

const inboxListOptions: CommandOption[] = [
  {
    name: 'all',
    short: 'a',
    description: t('inbox.list.option.all'),
  },
  {
    name: 'status',
    short: 's',
    description: t('inbox.list.option.status'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
  {
    name: 'full',
    short: 'F',
    description: t('inbox.list.option.full'),
  },
];

async function inboxListHandler(
  args: string[],
  options: InboxListOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('inbox.list.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [entityArg] = args;

  const { api, inboxService, error } = createAPIAndInboxService(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Resolve entity
    const entity = await resolveEntity(api, entityArg);
    if (!entity) {
      return failure(t('inbox.error.notFound', { id: entityArg }), ExitCode.NOT_FOUND);
    }

    // Build filter
    const filter: InboxFilter = {};

    // Status filter
    if (options.status) {
      const validStatuses = Object.values(InboxStatus);
      if (!validStatuses.includes(options.status as InboxStatus)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      filter.status = options.status as InboxStatus;
    } else if (!options.all) {
      // Default to unread only
      filter.status = InboxStatus.UNREAD;
    }

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Get inbox items (entity.id is ElementId, we need to cast to EntityId)
    const items = inboxService.getInbox(entity.id as unknown as EntityId, filter);

    // Format output
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (items.length === 0) {
      const statusText = options.status || (options.all ? 'any' : 'unread');
      if (mode === 'json') {
        return success(items);
      }
      if (mode === 'quiet') {
        return success('');
      }
      return success(items, t('inbox.list.empty', { status: statusText, name: entity.name }));
    }

    // Fetch message content for each inbox item
    const showFullContent = options.full;
    const itemsWithContent: Array<InboxItem & { content?: string }> = [];

    for (const item of items) {
      // Get the message associated with this inbox item
      const message = await api.get<HydratedMessage>(item.messageId as unknown as ElementId, {
        hydrate: { content: true }
      });
      itemsWithContent.push({
        ...item,
        content: message?.content,
      });
    }

    if (mode === 'json') {
      return success(itemsWithContent);
    }

    if (mode === 'quiet') {
      return success(items.map((i) => i.id).join('\n'));
    }

    // Human-readable table output
    const headers = [t('label.id'), 'STATUS', 'SOURCE', 'CONTENT', 'CREATED'];
    const rows = itemsWithContent.map((item) => {
      const statusIcon = getStatusIcon(item.status);
      const content = item.content ?? '';
      // Truncate content to ~80 chars by default, show full if --full/--verbose
      const displayContent = showFullContent
        ? content
        : (content.length > 80 ? content.substring(0, 77) + '...' : content);
      // Replace newlines with spaces for table display
      const singleLineContent = displayContent.replace(/\n/g, ' ');
      return [
        item.id,
        `${statusIcon} ${item.status}`,
        item.sourceType,
        singleLineContent,
        formatTimestamp(item.createdAt),
      ];
    });

    const table = formatter.table(headers, rows);
    const summary = `\n${t('inbox.list.summary', { count: items.length, name: entity.name })}`;

    return success(itemsWithContent, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('inbox.error.failedToGet', { message }), ExitCode.GENERAL_ERROR);
  }
}

function getStatusIcon(status: InboxStatus): string {
  switch (status) {
    case InboxStatus.UNREAD:
      return '*';
    case InboxStatus.READ:
      return ' ';
    case InboxStatus.ARCHIVED:
      return 'A';
    default:
      return '?';
  }
}

export const inboxListCommand: Command = {
  name: 'list',
  description: t('inbox.list.description'),
  usage: 'sf inbox <entity> [options]',
  help: t('inbox.list.help'),
  options: inboxListOptions,
  handler: inboxListHandler as Command['handler'],
};

// ============================================================================
// Inbox Read Command
// ============================================================================

async function inboxReadHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('inbox.read.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [itemId] = args;

  const { inboxService, error } = createAPIAndInboxService(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const item = inboxService.markAsRead(itemId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(item);
    }

    if (mode === 'quiet') {
      return success(item.id);
    }

    return success(item, t('inbox.read.success', { id: itemId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found')) {
      return failure(t('inbox.error.itemNotFound', { id: itemId }), ExitCode.NOT_FOUND);
    }
    return failure(t('inbox.error.failedToMark', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const inboxReadCommand: Command = {
  name: 'read',
  description: t('inbox.read.description'),
  usage: 'sf inbox read <item-id>',
  help: t('inbox.read.help'),
  options: [],
  handler: inboxReadHandler as Command['handler'],
};

// ============================================================================
// Inbox Read-All Command
// ============================================================================

async function inboxReadAllHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('inbox.readAll.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [entityArg] = args;

  const { api, inboxService, error } = createAPIAndInboxService(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Resolve entity
    const entity = await resolveEntity(api, entityArg);
    if (!entity) {
      return failure(t('inbox.error.notFound', { id: entityArg }), ExitCode.NOT_FOUND);
    }

    const count = inboxService.markAllAsRead(entity.id as unknown as EntityId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ count, entityId: entity.id });
    }

    if (mode === 'quiet') {
      return success(String(count));
    }

    return success({ count }, t('inbox.readAll.success', { count, name: entity.name }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('inbox.error.failedToMark', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const inboxReadAllCommand: Command = {
  name: 'read-all',
  description: t('inbox.readAll.description'),
  usage: 'sf inbox read-all <entity>',
  help: t('inbox.readAll.help'),
  options: [],
  handler: inboxReadAllHandler as Command['handler'],
};

// ============================================================================
// Inbox Unread Command
// ============================================================================

async function inboxUnreadHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('inbox.unread.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [itemId] = args;

  const { inboxService, error } = createAPIAndInboxService(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const item = inboxService.markAsUnread(itemId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(item);
    }

    if (mode === 'quiet') {
      return success(item.id);
    }

    return success(item, t('inbox.unread.success', { id: itemId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found')) {
      return failure(t('inbox.error.itemNotFound', { id: itemId }), ExitCode.NOT_FOUND);
    }
    return failure(t('inbox.error.failedToMark', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const inboxUnreadCommand: Command = {
  name: 'unread',
  description: t('inbox.unread.description'),
  usage: 'sf inbox unread <item-id>',
  help: t('inbox.unread.help'),
  options: [],
  handler: inboxUnreadHandler as Command['handler'],
};

// ============================================================================
// Inbox Archive Command
// ============================================================================

async function inboxArchiveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('inbox.archive.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [itemId] = args;

  const { inboxService, error } = createAPIAndInboxService(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const item = inboxService.archive(itemId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(item);
    }

    if (mode === 'quiet') {
      return success(item.id);
    }

    return success(item, t('inbox.archive.success', { id: itemId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found')) {
      return failure(t('inbox.error.itemNotFound', { id: itemId }), ExitCode.NOT_FOUND);
    }
    return failure(t('inbox.archive.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const inboxArchiveCommand: Command = {
  name: 'archive',
  description: t('inbox.archive.description'),
  usage: 'sf inbox archive <item-id>',
  help: t('inbox.archive.help'),
  options: [],
  handler: inboxArchiveHandler as Command['handler'],
};

// ============================================================================
// Inbox Count Command
// ============================================================================

async function inboxCountHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('inbox.count.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [entityArg] = args;

  const { api, inboxService, error } = createAPIAndInboxService(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Resolve entity
    const entity = await resolveEntity(api, entityArg);
    if (!entity) {
      return failure(t('inbox.error.notFound', { id: entityArg }), ExitCode.NOT_FOUND);
    }

    const count = inboxService.getUnreadCount(entity.id as unknown as EntityId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ count, entityId: entity.id, entityName: entity.name });
    }

    if (mode === 'quiet') {
      return success(String(count));
    }

    return success({ count }, t('inbox.count.result', { name: entity.name, count }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('inbox.error.failedToGet', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const inboxCountCommand: Command = {
  name: 'count',
  description: t('inbox.count.description'),
  usage: 'sf inbox count <entity>',
  help: t('inbox.count.help'),
  options: [],
  handler: inboxCountHandler as Command['handler'],
};

// ============================================================================
// Main Inbox Command
// ============================================================================

export const inboxCommand: Command = {
  name: 'inbox',
  description: t('inbox.description'),
  usage: 'sf inbox <entity> [options] or sf inbox <subcommand>',
  help: t('inbox.help'),
  options: inboxListOptions,
  handler: inboxListHandler as Command['handler'],
  subcommands: {
    read: inboxReadCommand,
    'read-all': inboxReadAllCommand,
    unread: inboxUnreadCommand,
    archive: inboxArchiveCommand,
    count: inboxCountCommand,
  },
};
