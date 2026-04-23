/**
 * Document Commands - Document management CLI interface
 *
 * Provides CLI commands for document operations:
 * - doc create: Create a new document
 * - doc list: List documents
 * - doc history: Show document version history
 * - doc rollback: Rollback to a previous version
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import {
  createDocument,
  ContentType,
  DocumentCategory,
  DocumentStatus,
  isValidDocumentCategory,
  isValidDocumentStatus,
  type Document,
  type CreateDocumentInput,
  type DocumentId,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Document Create Command
// ============================================================================

interface DocCreateOptions {
  title?: string;
  content?: string;
  file?: string;
  type?: string;
  category?: string;
  tag?: string[];
  metadata?: string;
}

const docCreateOptions: CommandOption[] = [
  {
    name: 'title',
    description: t('document.create.option.title'),
    hasValue: true,
  },
  {
    name: 'content',
    short: 'c',
    description: t('document.create.option.content'),
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: t('label.option.readFile'),
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: t('document.create.option.type'),
    hasValue: true,
  },
  {
    name: 'category',
    description: t('document.create.option.category'),
    hasValue: true,
  },
  {
    name: 'tag',
    description: t('label.option.tag'),
    hasValue: true,
    array: true,
  },
  {
    name: 'metadata',
    short: 'm',
    description: t('label.option.metadata'),
    hasValue: true,
  },
];

async function docCreateHandler(
  _args: string[],
  options: GlobalOptions & DocCreateOptions
): Promise<CommandResult> {
  // Must specify either --content or --file
  if (!options.content && !options.file) {
    return failure(t('document.error.contentOrFileRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  if (options.content && options.file) {
    return failure(t('document.error.contentAndFile'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Get content
    let content: string;
    if (options.content) {
      content = options.content;
    } else {
      const filePath = resolve(options.file!);
      if (!existsSync(filePath)) {
        return failure(t('document.error.notFound', { id: filePath }), ExitCode.NOT_FOUND);
      }
      content = readFileSync(filePath, 'utf-8');
    }

    // Parse content type
    let contentType = ContentType.TEXT;
    if (options.type) {
      const validTypes = Object.values(ContentType);
      if (!validTypes.includes(options.type as typeof ContentType.TEXT)) {
        return failure(
          `Invalid content type: ${options.type}. Must be one of: ${validTypes.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      contentType = options.type as typeof ContentType.TEXT;
    }

    // Validate category
    if (options.category && !isValidDocumentCategory(options.category)) {
      const validCategories = Object.values(DocumentCategory);
      return failure(
        `Invalid category: ${options.category}. Must be one of: ${validCategories.join(', ')}`,
        ExitCode.VALIDATION
      );
    }

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Parse metadata if provided
    let metadata: Record<string, unknown> | undefined;
    if (options.metadata) {
      try {
        metadata = JSON.parse(options.metadata);
      } catch {
        return failure(t('document.error.invalidJson'), ExitCode.VALIDATION);
      }
    }

    const input: CreateDocumentInput = {
      content,
      contentType,
      createdBy: actor,
      ...(options.title && { title: options.title }),
      ...(tags && { tags }),
      ...(metadata && { metadata }),
      ...(options.category && { category: options.category as typeof DocumentCategory.OTHER }),
    };

    const doc = await createDocument(input, api.getIdGeneratorConfig());
    const created = await api.create(doc as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, t('document.create.success', { id: created.id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('document.error.failedToCreate', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docCreateCommand: Command = {
  name: 'create',
  description: t('document.create.description'),
  usage: 'sf document create --content <text> | --file <path> [options]',
  help: t('document.create.help'),
  options: docCreateOptions,
  handler: docCreateHandler as Command['handler'],
};

// ============================================================================
// Document List Command
// ============================================================================

interface DocListOptions {
  limit?: string;
  type?: string;
  category?: string;
  status?: string;
  all?: boolean;
}

const docListOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: t('document.list.option.type'),
    hasValue: true,
  },
  {
    name: 'category',
    description: t('document.list.option.category'),
    hasValue: true,
  },
  {
    name: 'status',
    description: t('document.list.option.status'),
    hasValue: true,
  },
  {
    name: 'all',
    short: 'a',
    description: t('document.list.option.all'),
    hasValue: false,
  },
];

async function docListHandler(
  _args: string[],
  options: GlobalOptions & DocListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'document',
    };

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Category filter
    if (options.category) {
      if (!isValidDocumentCategory(options.category)) {
        const validCategories = Object.values(DocumentCategory);
        return failure(
          `Invalid category: ${options.category}. Must be one of: ${validCategories.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      filter.category = options.category;
    }

    // Status filter: --all includes everything, --status filters explicitly, default is active only
    if (options.all) {
      filter.status = [DocumentStatus.ACTIVE, DocumentStatus.ARCHIVED];
    } else if (options.status) {
      if (!isValidDocumentStatus(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: active, archived`,
          ExitCode.VALIDATION
        );
      }
      filter.status = options.status;
    }
    // Default: active only (handled by buildDocumentWhereClause)

    const result = await api.listPaginated<Document>(filter);
    let items = result.items;

    // Filter by content type if specified
    if (options.type) {
      items = items.filter((d) => d.contentType === options.type);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((d) => d.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, t('document.list.empty'));
    }

    // Build table
    const headers = [t('label.id'), 'TYPE', 'CATEGORY', 'STATUS', 'VERSION', 'SIZE', 'CREATED'];
    const rows = items.map((d) => [
      d.id,
      d.contentType,
      d.category ?? 'other',
      d.status ?? 'active',
      `v${d.version}`,
      formatSize(d.content.length),
      d.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${t('document.list.summary', { shown: items.length, total: result.total })}`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('document.error.failedToList', { message }), ExitCode.GENERAL_ERROR);
  }
}

/**
 * Format size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const docListCommand: Command = {
  name: 'list',
  description: t('document.list.description'),
  usage: 'sf document list [options]',
  help: t('document.list.help'),
  options: docListOptions,
  handler: docListHandler as Command['handler'],
};

// ============================================================================
// Document History Command
// ============================================================================

interface DocHistoryOptions {
  limit?: string;
}

const docHistoryOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function docHistoryHandler(
  args: string[],
  options: GlobalOptions & DocHistoryOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure(t('document.history.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get current document to verify it exists
    const current = await api.get<Document>(docId as ElementId);
    if (!current) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }
    if (current.type !== 'document') {
      return failure(t('document.error.notDocument', { id: docId, type: current.type }), ExitCode.VALIDATION);
    }

    // Check if document is deleted (tombstone)
    const data = current as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }

    // Get version history
    const history = await api.getDocumentHistory(current.id as unknown as DocumentId);

    // Apply limit
    let versions = history;
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      versions = history.slice(0, limit);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(versions);
    }

    if (mode === 'quiet') {
      return success(versions.map((v) => `v${v.version}`).join('\n'));
    }

    if (versions.length === 0) {
      return success(null, t('document.history.empty'));
    }

    // Build table
    const headers = [t('label.version'), t('label.size'), t('label.modified'), t('label.current')];
    const rows = versions.map((v) => [
      `v${v.version}`,
      formatSize(v.content.length),
      v.updatedAt.split('T')[0],
      v.id === current.id ? t('label.yes') : '',
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${t('document.history.summary', { id: docId, count: history.length })}`;

    return success(versions, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('document.error.failedToGet', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docHistoryCommand: Command = {
  name: 'history',
  description: t('document.history.description'),
  usage: 'sf document history <document-id> [options]',
  help: t('document.history.help'),
  options: docHistoryOptions,
  handler: docHistoryHandler as Command['handler'],
};

// ============================================================================
// Document Rollback Command
// ============================================================================

async function docRollbackHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [docId, versionStr] = args;

  if (!docId || !versionStr) {
    return failure(t('document.rollback.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const version = parseInt(versionStr, 10);
  if (isNaN(version) || version < 1) {
    return failure(t('error.versionPositive'), ExitCode.VALIDATION);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Get the target version
    const targetVersion = await api.getDocumentVersion(docId as unknown as DocumentId, version);
    if (!targetVersion) {
      return failure(t('document.error.versionNotFound', { version, id: docId }), ExitCode.NOT_FOUND);
    }

    // Get current document
    const current = await api.get<Document>(docId as ElementId);
    if (!current) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }

    // Check if document is deleted (tombstone)
    const data = current as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(t('document.rollback.error.deleted', { id: docId }), ExitCode.NOT_FOUND);
    }

    // Already at that version?
    if (current.version === version) {
      return success(current, t('document.rollback.alreadyAtVersion', { version }));
    }

    // Update document with content from target version
    // This creates a new version with the old content
    const updated = await api.update<Document>(
      docId as ElementId,
      { content: targetVersion.content },
      { actor }
    );

    return success(
      updated,
      `Rolled back document ${docId} to version ${version} (new version: ${updated.version})`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return failure(message, ExitCode.NOT_FOUND);
    }
    if (code === 'INVALID_INPUT') {
      return failure(message, ExitCode.VALIDATION);
    }
    return failure(t('document.error.failedToRollback', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docRollbackCommand: Command = {
  name: 'rollback',
  description: t('document.rollback.description'),
  usage: 'sf document rollback <document-id> <version>',
  help: t('document.rollback.help'),
  handler: docRollbackHandler as Command['handler'],
};

// ============================================================================
// Document Update Command
// ============================================================================

interface DocUpdateOptions {
  content?: string;
  file?: string;
  metadata?: string;
  category?: string;
}

const docUpdateOptions: CommandOption[] = [
  {
    name: 'content',
    short: 'c',
    description: t('document.update.option.content'),
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: t('document.update.option.file'),
    hasValue: true,
  },
  {
    name: 'metadata',
    short: 'm',
    description: t('label.option.metadataMerge'),
    hasValue: true,
  },
  {
    name: 'category',
    description: t('document.update.option.category'),
    hasValue: true,
  },
];

async function docUpdateHandler(
  args: string[],
  options: GlobalOptions & DocUpdateOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure(t('document.update.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  // Must specify at least one of --content, --file, --metadata, or --category
  if (!options.content && !options.file && !options.metadata && !options.category) {
    return failure(t('document.update.error.noChange'), ExitCode.INVALID_ARGUMENTS);
  }

  if (options.content && options.file) {
    return failure(t('document.error.contentAndFile'), ExitCode.INVALID_ARGUMENTS);
  }

  // Validate category
  if (options.category && !isValidDocumentCategory(options.category)) {
    const validCategories = Object.values(DocumentCategory);
    return failure(
      `Invalid category: ${options.category}. Must be one of: ${validCategories.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify document exists
    const existing = await api.get<Document>(docId as ElementId);
    if (!existing) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }
    if (existing.type !== 'document') {
      return failure(t('document.error.notDocument', { id: docId, type: existing.type }), ExitCode.VALIDATION);
    }

    // Check if document is deleted (tombstone)
    const data = existing as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }

    const actor = resolveActor(options);

    // Parse metadata if provided
    let metadata: Record<string, unknown> | undefined;
    if (options.metadata) {
      try {
        metadata = JSON.parse(options.metadata);
      } catch {
        return failure(t('document.error.invalidJson'), ExitCode.VALIDATION);
      }
    }

    // Get new content if provided
    let content: string | undefined;
    if (options.content) {
      content = options.content;
    } else if (options.file) {
      const filePath = resolve(options.file);
      if (!existsSync(filePath)) {
        return failure(t('document.error.notFound', { id: filePath }), ExitCode.NOT_FOUND);
      }
      content = readFileSync(filePath, 'utf-8');
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {};
    if (content !== undefined) updatePayload.content = content;
    if (metadata) updatePayload.metadata = metadata;
    if (options.category) updatePayload.category = options.category;

    // Update the document (creates a new version)
    const updated = await api.update<Document>(
      docId as ElementId,
      updatePayload,
      { actor }
    );

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success(updated);
    }
    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, t('document.update.success', { id: docId, version: updated.version }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('document.error.failedToUpdate', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docUpdateCommand: Command = {
  name: 'update',
  description: t('document.update.description'),
  usage: 'sf document update <document-id> --content <text> | --file <path> | --metadata <json> | --category <category>',
  help: t('document.update.help'),
  options: docUpdateOptions,
  handler: docUpdateHandler as Command['handler'],
};

// ============================================================================
// Document Show Command
// ============================================================================

interface DocShowOptions {
  docVersion?: string;
}

const docShowOptions: CommandOption[] = [
  {
    name: 'docVersion',
    description: t('document.show.option.version'),
    hasValue: true,
  },
];

async function docShowHandler(
  args: string[],
  options: GlobalOptions & DocShowOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure(t('document.show.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    let doc: Document | null;

    if (options.docVersion) {
      const version = parseInt(options.docVersion, 10);
      if (isNaN(version) || version < 1) {
        return failure(t('error.versionPositive'), ExitCode.VALIDATION);
      }
      doc = await api.getDocumentVersion(docId as unknown as DocumentId, version);
      if (!doc) {
        return failure(t('document.error.versionNotFound', { version, id: docId }), ExitCode.NOT_FOUND);
      }
    } else {
      doc = await api.get<Document>(docId as ElementId);
      if (!doc) {
        return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
      }
      if (doc.type !== 'document') {
        return failure(t('document.error.notDocument', { id: docId, type: doc.type }), ExitCode.VALIDATION);
      }
    }

    // Check if document is deleted (tombstone)
    const data = doc as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(doc);
    }

    if (mode === 'quiet') {
      return success(doc.content);
    }

    // Format document details
    const output = formatter.element(doc as unknown as Record<string, unknown>);
    return success(doc, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return failure(message, ExitCode.NOT_FOUND);
    }
    if (code === 'INVALID_INPUT') {
      return failure(message, ExitCode.VALIDATION);
    }
    return failure(t('document.error.failedToShow', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docShowCommand: Command = {
  name: 'show',
  description: t('document.show.description'),
  usage: 'sf document show <document-id> [options]',
  help: t('document.show.help'),
  options: docShowOptions,
  handler: docShowHandler as Command['handler'],
};

// ============================================================================
// Document Archive Command
// ============================================================================

async function docArchiveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure(t('document.archive.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const existing = await api.get<Document>(docId as ElementId);
    if (!existing) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }
    if (existing.type !== 'document') {
      return failure(t('document.error.notADocument', { id: docId }), ExitCode.VALIDATION);
    }

    const updated = await api.update<Document>(
      docId as ElementId,
      { status: DocumentStatus.ARCHIVED } as Partial<Document>,
      { actor: resolveActor(options) }
    );

    return success(updated, t('document.archive.success', { id: docId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('document.error.failedToArchive', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docArchiveCommand: Command = {
  name: 'archive',
  description: t('document.archive.description'),
  usage: 'sf document archive <document-id>',
  help: t('document.archive.help'),
  handler: docArchiveHandler as Command['handler'],
};

// ============================================================================
// Document Delete Command
// ============================================================================

interface DocDeleteOptions {
  reason?: string;
  force?: boolean;
}

const docDeleteOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: t('label.option.reason'),
    hasValue: true,
  },
  {
    name: 'force',
    short: 'f',
    description: t('label.option.skipConfirm'),
    hasValue: false,
  },
];

async function docDeleteHandler(
  args: string[],
  options: GlobalOptions & DocDeleteOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure(t('document.delete.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const existing = await api.get<Document>(docId as ElementId);
    if (!existing) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }
    if (existing.type !== 'document') {
      return failure(t('document.error.notADocument', { id: docId }), ExitCode.VALIDATION);
    }

    // Check if document is already deleted (tombstone)
    const data = existing as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }

    const actor = resolveActor(options);
    await api.delete(docId as ElementId, { actor, reason: options.reason } as Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ id: docId, deleted: true, type: 'document' });
    }
    if (mode === 'quiet') {
      return success(docId);
    }
    return success(null, t('document.delete.success', { id: docId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return failure(message, ExitCode.NOT_FOUND);
    }
    return failure(t('document.error.failedToDelete', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docDeleteCommand: Command = {
  name: 'delete',
  description: t('document.delete.description'),
  usage: 'sf document delete <document-id> [options]',
  help: t('document.delete.help'),
  options: docDeleteOptions,
  handler: docDeleteHandler as Command['handler'],
};

// ============================================================================
// Document Unarchive Command
// ============================================================================

async function docUnarchiveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure(t('document.unarchive.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const existing = await api.get<Document>(docId as ElementId);
    if (!existing) {
      return failure(t('document.error.notFound', { id: docId }), ExitCode.NOT_FOUND);
    }
    if (existing.type !== 'document') {
      return failure(t('document.error.notADocument', { id: docId }), ExitCode.VALIDATION);
    }

    const updated = await api.update<Document>(
      docId as ElementId,
      { status: DocumentStatus.ACTIVE } as Partial<Document>,
      { actor: resolveActor(options) }
    );

    return success(updated, t('document.unarchive.success', { id: docId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('document.error.failedToUnarchive', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docUnarchiveCommand: Command = {
  name: 'unarchive',
  description: t('document.unarchive.description'),
  usage: 'sf document unarchive <document-id>',
  help: t('document.unarchive.help'),
  handler: docUnarchiveHandler as Command['handler'],
};

// ============================================================================
// Document Search Command
// ============================================================================

interface DocSearchOptions {
  category?: string;
  status?: string;
  limit?: string;
}

const docSearchOptions: CommandOption[] = [
  {
    name: 'category',
    description: t('label.option.filterByCategory'),
    hasValue: true,
  },
  {
    name: 'status',
    description: t('label.option.filterByStatus'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function docSearchHandler(
  args: string[],
  options: GlobalOptions & DocSearchOptions
): Promise<CommandResult> {
  if (args.length === 0) {
    return failure(t('document.search.error.queryRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const query = args.join(' ');

    // Validate category
    if (options.category) {
      if (!isValidDocumentCategory(options.category)) {
        const validCategories = Object.values(DocumentCategory);
        return failure(
          `Invalid category: ${options.category}. Must be one of: ${validCategories.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
    }

    // Validate status
    if (options.status) {
      if (!isValidDocumentStatus(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: active, archived`,
          ExitCode.VALIDATION
        );
      }
    }

    // Validate limit
    let hardCap = 50;
    if (options.limit) {
      hardCap = parseInt(options.limit, 10);
      if (isNaN(hardCap) || hardCap < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
    }

    const searchOptions: Record<string, unknown> = { hardCap };
    if (options.category) searchOptions.category = options.category;
    if (options.status) searchOptions.status = options.status;

    const results = await api.searchDocumentsFTS(query, searchOptions as Parameters<typeof api.searchDocumentsFTS>[1]);

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(results);
    }

    if (mode === 'quiet') {
      return success(results.map((r) => r.document.id).join('\n'));
    }

    if (results.length === 0) {
      return success(null, t('document.list.empty'));
    }

    const headers = [t('label.id'), 'SCORE', 'TITLE', 'CATEGORY', 'SNIPPET'];
    const rows = results.map((r) => [
      r.document.id,
      r.score.toFixed(2),
      (r.document.title ?? '').slice(0, 40),
      r.document.category ?? 'other',
      r.snippet.slice(0, 60).replace(/\n/g, ' '),
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${t('document.search.summary', { count: results.length, query })}`;

    return success(results, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('document.search.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docSearchCommand: Command = {
  name: 'search',
  description: t('document.search.description'),
  usage: 'sf document search <query> [options]',
  help: t('document.search.help'),
  options: docSearchOptions,
  handler: docSearchHandler as Command['handler'],
};

// ============================================================================
// Document Reindex Command
// ============================================================================

async function docReindexHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const result = api.reindexAllDocumentsFTS();
    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success(result);
    }
    return success(
      null,
      t('document.reindex.success', { indexed: result.indexed, errors: result.errors })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('document.error.failedToReindex', { message }), ExitCode.GENERAL_ERROR);
  }
}

const docReindexCommand: Command = {
  name: 'reindex',
  description: t('document.reindex.description'),
  usage: 'sf document reindex',
  help: t('document.reindex.help'),
  handler: docReindexHandler as Command['handler'],
};

// ============================================================================
// Document Root Command
// ============================================================================

export const documentCommand: Command = {
  name: 'document',
  description: t('document.description'),
  usage: 'sf document <subcommand> [options]',
  help: t('document.help'),
  subcommands: {
    create: docCreateCommand,
    list: docListCommand,
    search: docSearchCommand,
    show: docShowCommand,
    update: docUpdateCommand,
    history: docHistoryCommand,
    rollback: docRollbackCommand,
    archive: docArchiveCommand,
    unarchive: docUnarchiveCommand,
    delete: docDeleteCommand,
    reindex: docReindexCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: docCreateCommand,
    add: docCreateCommand,
    ls: docListCommand,
    rm: docDeleteCommand,
    get: docShowCommand,
    view: docShowCommand,
    edit: docUpdateCommand,
    find: docSearchCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return docListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(documentCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = t('error.unknownSubcommand', { subcommand: args[0] });
    if (suggestions.length > 0) {
      msg += '\n' + suggestions.map(s => `  ${s}`).join('\n');
    }
    msg += '\n\n' + t('error.runHelp', { command: 'sf document' });
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
