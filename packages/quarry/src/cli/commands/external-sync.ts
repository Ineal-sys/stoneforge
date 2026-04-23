/**
 * External Sync Commands - Manage bidirectional sync with external services
 *
 * Provides CLI commands for external service synchronization:
 * - config: Show/set provider configuration (tokens, projects)
 * - link: Link a task/document to an external issue/page
 * - link-all: Bulk-link all unlinked tasks or documents
 * - unlink: Remove external link from a task/document
 * - unlink-all: Bulk-remove external links from all linked elements
 * - push: Push linked elements to external service
 * - pull: Pull changes from external for linked elements
 * - sync: Bidirectional sync (push + pull)
 * - status: Show sync state overview
 * - resolve: Resolve sync conflicts
 */

import type { Command, CommandResult, GlobalOptions, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { t } from '../i18n/index.js';
import { createAPI, resolveDatabasePath } from '../db.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { getValue, setValue, VALID_AUTO_LINK_PROVIDERS } from '../../config/index.js';
import type { Task, Document, ElementId, ExternalProvider, ExternalSyncState, SyncDirection, SyncAdapterType, TaskSyncAdapter, DocumentSyncAdapter } from '@stoneforge/core';
import { taskToExternalTask, getFieldMapConfigForProvider } from '../../external-sync/adapters/task-sync-adapter.js';
import { isSyncableDocument, documentToExternalDocumentInput, resolveDocumentLibraryPath, resolveDocumentLibraryPaths } from '../../external-sync/adapters/document-sync-adapter.js';
import type { LibraryPathAPI } from '../../external-sync/adapters/document-sync-adapter.js';
import { createProgressBar, nullProgressBar } from '../utils/progress.js';

/**
 * Providers that do not require an authentication token.
 * These providers sync to local resources (e.g., filesystem directories)
 * and can be used with just a project/path configured.
 */
const TOKENLESS_PROVIDERS = new Set(['folder']);

/**
 * Threshold for showing a warning when operating on a large set of elements.
 * Operations targeting more than this number of elements will display a
 * warning to inform the user the operation may take a significant amount of time.
 */
const LARGE_SET_WARNING_THRESHOLD = 100;

// ============================================================================
// Type Flag Helper
// ============================================================================

/**
 * Parse the --type flag value into an array of SyncAdapterType values.
 *
 * @param typeFlag - The --type flag value: 'task', 'document', or 'all'
 * @returns Array of adapter types, or undefined for 'all' (no filter)
 */
function parseTypeFlag(typeFlag?: string): SyncAdapterType[] | undefined {
  if (!typeFlag || typeFlag === 'all') {
    return undefined; // No filter — process all types
  }
  if (typeFlag === 'task') {
    return ['task'];
  }
  if (typeFlag === 'document') {
    return ['document'];
  }
  return undefined; // Unknown value — treat as 'all'
}

/**
 * Validate the --type flag value.
 *
 * @returns Error message if invalid, undefined if valid
 */
function validateTypeFlag(typeFlag?: string): string | undefined {
  if (!typeFlag || typeFlag === 'all' || typeFlag === 'task' || typeFlag === 'document') {
    return undefined;
  }
  return t('externalSync.invalidTypeValue', { value: typeFlag });
}

// ============================================================================
// Settings Service Helper
// ============================================================================

/**
 * Dynamically imports and creates a SettingsService from a storage backend.
 * Uses optional peer dependency @stoneforge/smithy.
 */
async function createSettingsServiceFromOptions(options: GlobalOptions): Promise<{
  settingsService: SettingsServiceLike;
  error?: string;
}> {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return {
      settingsService: null as unknown as SettingsServiceLike,
      error: t('db.noDatabase'),
    };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);

    // Dynamic import to handle optional peer dependency
    // @ts-ignore — smithy is an optional runtime dependency, may not be installed
    const { createSettingsService } = await import('@stoneforge/smithy/services');
    // @ts-ignore — StorageBackend type may differ across compilation units (local source vs global dist)
    return { settingsService: createSettingsService(backend) as SettingsServiceLike };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If the import fails, the smithy package isn't available
    if (message.includes('Cannot find') || message.includes('MODULE_NOT_FOUND')) {
      return {
        settingsService: null as unknown as SettingsServiceLike,
        error: t('externalSync.requiresSmithy'),
      };
    }
    return {
      settingsService: null as unknown as SettingsServiceLike,
      error: t('externalSync.failedToInitSettings', { message }),
    };
  }
}

/**
 * Lightweight interface matching the subset of SettingsService we need.
 * Avoids hard dependency on smithy types at compile time.
 */
interface ProviderConfigLike {
  provider: string;
  token?: string;
  apiBaseUrl?: string;
  defaultProject?: string;
}

interface ExternalSyncSettingsLike {
  providers: Record<string, ProviderConfigLike>;
  syncCursors: Record<string, string>;
  pollIntervalMs: number;
  defaultDirection: string;
}

interface SettingsServiceLike {
  getExternalSyncSettings(): ExternalSyncSettingsLike;
  setExternalSyncSettings(settings: ExternalSyncSettingsLike): ExternalSyncSettingsLike;
  getProviderConfig(provider: string): ProviderConfigLike | undefined;
  setProviderConfig(provider: string, config: ProviderConfigLike): ProviderConfigLike;
  getSetting(key: string): { value: unknown } | undefined;
  setSetting(key: string, value: unknown): { value: unknown };
}

// ============================================================================
// Token Masking
// ============================================================================

/**
 * Masks a token for display, showing only first 4 and last 4 characters
 */
function maskToken(token: string): string {
  if (token.length <= 8) {
    return '****';
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

// ============================================================================
// Config Command
// ============================================================================

async function configHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { settingsService, error } = await createSettingsServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const settings = settingsService.getExternalSyncSettings();
  const mode = getOutputMode(options);

  // Also get file-based config for display
  const enabled = getValue('externalSync.enabled');
  const conflictStrategy = getValue('externalSync.conflictStrategy');
  const defaultDirection = getValue('externalSync.defaultDirection');
  const pollInterval = getValue('externalSync.pollInterval');
  const autoLink = getValue('externalSync.autoLink');
  const autoLinkProvider = getValue('externalSync.autoLinkProvider');
  const autoLinkDocumentProvider = getValue('externalSync.autoLinkDocumentProvider');

  const configData = {
    enabled,
    conflictStrategy,
    defaultDirection,
    pollInterval,
    autoLink,
    autoLinkProvider,
    autoLinkDocumentProvider,
    providers: Object.fromEntries(
      Object.entries(settings.providers).map(([name, config]) => [
        name,
        {
          ...config,
          token: config.token ? maskToken(config.token) : undefined,
        },
      ])
    ),
  };

  if (mode === 'json') {
    return success(configData);
  }

  if (mode === 'quiet') {
    const providerNames = Object.keys(settings.providers);
    return success(providerNames.length > 0 ? providerNames.join(',') : 'none');
  }

  // Human-readable output
  const lines: string[] = [
    t('externalSync.config.title'),
    '',
    `  ${t('externalSync.config.enabled')}:            ${enabled ? t('externalSync.config.yes') : t('externalSync.config.no')}`,
    `  ${t('externalSync.config.conflictStrategy')}:  ${conflictStrategy}`,
    `  ${t('externalSync.config.defaultDirection')}:  ${defaultDirection}`,
    `  ${t('externalSync.config.pollInterval')}:      ${pollInterval}ms`,
    `  ${t('externalSync.config.autoLink')}:          ${autoLink ? t('externalSync.config.yes') : t('externalSync.config.no')}`,
    `  ${t('externalSync.config.autoLinkProviderTasks')}: ${autoLinkProvider ?? t('externalSync.config.notSet')}`,
    `  ${t('externalSync.config.autoLinkProviderDocs')}:  ${autoLinkDocumentProvider ?? t('externalSync.config.notSet')}`,
    '',
  ];

  const providerEntries = Object.entries(settings.providers);
  if (providerEntries.length === 0) {
    lines.push(`  ${t('externalSync.config.providers')}:          ${t('externalSync.config.noneConfigured')}`);
    lines.push('');
    lines.push(`  ${t('externalSync.config.providersHint')}`);
  } else {
    lines.push(`  ${t('externalSync.config.providers')}:`);
    for (const [name, config] of providerEntries) {
      lines.push(`    ${name}:`);
      lines.push(`      ${t('externalSync.config.token')}:           ${config.token ? maskToken(config.token) : t('externalSync.config.notSet')}`);
      lines.push(`      ${t('externalSync.config.apiUrl')}:         ${config.apiBaseUrl ?? t('externalSync.config.default_')}`);
      lines.push(`      ${t('externalSync.config.defaultProject')}: ${config.defaultProject ?? t('externalSync.config.notSet')}`);
    }
  }

  return success(configData, lines.join('\n'));
}

// ============================================================================
// Config Set-Token Command
// ============================================================================

async function configSetTokenHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure(
      `Usage: sf external-sync config set-token <provider> <token>`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [provider, token] = args;

  const { settingsService, error } = await createSettingsServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const existing = settingsService.getProviderConfig(provider) ?? { provider };
  settingsService.setProviderConfig(provider, { ...existing, token });

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ provider, tokenSet: true });
  }

  if (mode === 'quiet') {
    return success(provider);
  }

  return success(
    { provider, tokenSet: true },
    t('externalSync.config.tokenSetFor', { provider, token: maskToken(token) })
  );
}

// ============================================================================
// Config Set-Project Command
// ============================================================================

async function configSetProjectHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure(
      `Usage: sf external-sync config set-project <provider> <project>`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [provider, project] = args;

  const { settingsService, error } = await createSettingsServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const existing = settingsService.getProviderConfig(provider) ?? { provider };
  settingsService.setProviderConfig(provider, { ...existing, defaultProject: project });

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ provider, defaultProject: project });
  }

  if (mode === 'quiet') {
    return success(project);
  }

  return success(
    { provider, defaultProject: project },
    t('externalSync.config.defaultProjectSetFor', { provider, project })
  );
}

// ============================================================================
// Config Set-Auto-Link Command
// ============================================================================

async function configSetAutoLinkHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      'Usage: sf external-sync config set-auto-link <provider> [--type task|document]',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [provider] = args;
  const typeFlag = (options as Record<string, unknown>).type as string | undefined;
  const linkType = typeFlag ?? 'task';

  // Validate --type flag
  if (linkType !== 'task' && linkType !== 'document') {
    return failure(
      t('externalSync.invalidTypeValueShort', { value: linkType }),
      ExitCode.VALIDATION
    );
  }

  // Validate provider name
  if (!VALID_AUTO_LINK_PROVIDERS.includes(provider)) {
    return failure(
      t('externalSync.invalidProvider', { provider, valid: VALID_AUTO_LINK_PROVIDERS.join(', ') }),
      ExitCode.VALIDATION
    );
  }

  // Check if provider has a token configured (skip for tokenless providers like folder)
  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  let tokenWarning: string | undefined;
  if (!settingsError && !TOKENLESS_PROVIDERS.has(provider)) {
    const providerConfig = settingsService.getProviderConfig(provider);
    if (!providerConfig?.token) {
      tokenWarning = t('externalSync.tokenWarning', { provider });
    }
  }

  if (linkType === 'document') {
    // Set document auto-link provider
    setValue('externalSync.autoLinkDocumentProvider', provider);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ autoLinkDocumentProvider: provider, warning: tokenWarning });
    }

    if (mode === 'quiet') {
      return success(provider);
    }

    const lines = [t('externalSync.config.autoLinkDocEnabled', { provider })];
    if (tokenWarning) {
      lines.push('');
      lines.push(tokenWarning);
    }

    return success(
      { autoLinkDocumentProvider: provider },
      lines.join('\n')
    );
  }

  // Default: task auto-link
  setValue('externalSync.autoLink', true);
  setValue('externalSync.autoLinkProvider', provider);

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ autoLink: true, autoLinkProvider: provider, warning: tokenWarning });
  }

  if (mode === 'quiet') {
    return success(provider);
  }

  const lines = [t('externalSync.config.autoLinkTaskEnabled', { provider })];
  if (tokenWarning) {
    lines.push('');
    lines.push(tokenWarning);
  }

  return success(
    { autoLink: true, autoLinkProvider: provider },
    lines.join('\n')
  );
}

// ============================================================================
// Config Disable-Auto-Link Command
// ============================================================================

async function configDisableAutoLinkHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const typeFlag = (options as Record<string, unknown>).type as string | undefined;
  const linkType = typeFlag ?? 'all';

  // Validate --type flag
  if (linkType !== 'task' && linkType !== 'document' && linkType !== 'all') {
    return failure(
      t('externalSync.invalidTypeValue', { value: linkType }),
      ExitCode.VALIDATION
    );
  }

  const mode = getOutputMode(options);

  if (linkType === 'document') {
    // Only clear document auto-link provider
    setValue('externalSync.autoLinkDocumentProvider', undefined);

    if (mode === 'json') {
      return success({ autoLinkDocumentProvider: null });
    }

    if (mode === 'quiet') {
      return success('disabled');
    }

    return success(
      { autoLinkDocumentProvider: null },
      t('externalSync.config.autoLinkDocDisabled')
    );
  }

  if (linkType === 'task') {
    // Only clear task auto-link
    setValue('externalSync.autoLink', false);
    setValue('externalSync.autoLinkProvider', undefined);

    if (mode === 'json') {
      return success({ autoLink: false, autoLinkProvider: null });
    }

    if (mode === 'quiet') {
      return success('disabled');
    }

    return success(
      { autoLink: false },
      t('externalSync.config.autoLinkTaskDisabled')
    );
  }

  // Default: disable all
  setValue('externalSync.autoLink', false);
  setValue('externalSync.autoLinkProvider', undefined);
  setValue('externalSync.autoLinkDocumentProvider', undefined);

  if (mode === 'json') {
    return success({ autoLink: false, autoLinkProvider: null, autoLinkDocumentProvider: null });
  }

  if (mode === 'quiet') {
    return success('disabled');
  }

  return success(
    { autoLink: false },
    t('externalSync.config.autoLinkDisabled')
  );
}

// ============================================================================
// Link Command
// ============================================================================

interface LinkOptions {
  provider?: string;
  type?: string;
}

const linkOptions: CommandOption[] = [
  {
    name: 'provider',
    short: 'p',
    description: t('externalSync.link.optionProvider'),
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: t('externalSync.link.optionType'),
    hasValue: true,
    defaultValue: 'task',
  },
];

async function linkHandler(
  args: string[],
  options: GlobalOptions & LinkOptions
): Promise<CommandResult> {
  const elementType = options.type ?? 'task';
  if (elementType !== 'task' && elementType !== 'document') {
    return failure(
      t('externalSync.invalidTypeValueShort', { value: elementType }),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (args.length < 2) {
    return failure(
      t('externalSync.linkAll.usage', { type: elementType }),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [elementId, urlOrExternalId] = args;
  const provider = options.provider ?? 'github';

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Resolve the element (task or document)
  let element: Task | Document | null;
  try {
    element = await api.get<Task | Document>(elementId as ElementId);
  } catch {
    return failure(t('externalSync.elementNotFound', { id: elementId }), ExitCode.NOT_FOUND);
  }

  if (!element) {
    return failure(t('externalSync.elementNotFound', { id: elementId }), ExitCode.NOT_FOUND);
  }

  if (element.type !== elementType) {
    return failure(t('externalSync.elementNotType', { id: elementId, type: elementType, actualType: element.type }), ExitCode.VALIDATION);
  }

  // Determine the external URL and external ID
  let externalUrl: string;
  let externalId: string;

  if (/^\d+$/.test(urlOrExternalId)) {
    // Bare number — construct URL from default project
    const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
    if (settingsError) {
      return failure(settingsError, ExitCode.GENERAL_ERROR);
    }

    const providerConfig = settingsService.getProviderConfig(provider);
    if (!providerConfig?.defaultProject) {
      return failure(
        t('externalSync.noDefaultProject', { provider }),
        ExitCode.VALIDATION
      );
    }

    externalId = urlOrExternalId;
    if (provider === 'github') {
      const baseUrl = providerConfig.apiBaseUrl
        ? providerConfig.apiBaseUrl.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '')
        : 'https://github.com';
      externalUrl = `${baseUrl}/${providerConfig.defaultProject}/issues/${urlOrExternalId}`;
    } else {
      // Generic URL construction for other providers
      externalUrl = `${providerConfig.defaultProject}#${urlOrExternalId}`;
    }
  } else {
    // Full URL or external ID provided
    externalUrl = urlOrExternalId;
    // Extract issue number from URL if present, otherwise use the full value
    const match = urlOrExternalId.match(/\/(\d+)\/?$/);
    externalId = match ? match[1] : urlOrExternalId;
  }

  // Extract project from URL if possible
  let project: string | undefined;
  const ghMatch = externalUrl.match(/github\.com\/([^/]+\/[^/]+)\//);
  if (ghMatch) {
    project = ghMatch[1];
  }

  // Determine the adapter type based on element type
  const adapterType: SyncAdapterType = elementType === 'document' ? 'document' : 'task';

  // Update element with externalRef and _externalSync metadata
  const syncMetadata = {
    provider,
    project: project ?? '',
    externalId,
    url: externalUrl,
    direction: getValue('externalSync.defaultDirection'),
    adapterType,
  };

  try {
    const existingMetadata = (element.metadata ?? {}) as Record<string, unknown>;
    await api.update(elementId as ElementId, {
      externalRef: externalUrl,
      metadata: {
        ...existingMetadata,
        _externalSync: syncMetadata,
      },
    } as Partial<Task | Document>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('externalSync.failedToUpdate', { type: elementType, message }), ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ elementId, elementType, externalUrl, provider, externalId, project, adapterType });
  }

  if (mode === 'quiet') {
    return success(externalUrl);
  }

  return success(
    { elementId, elementType, externalUrl, provider, externalId },
    t('externalSync.link.linked', { elementType, elementId, externalUrl })
  );
}

// ============================================================================
// Unlink Command
// ============================================================================

async function unlinkHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('externalSync.unlink.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [elementId] = args;

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Resolve element (task or document)
  let element: Task | Document | null;
  try {
    element = await api.get<Task | Document>(elementId as ElementId);
  } catch {
    return failure(t('externalSync.elementNotFound', { id: elementId }), ExitCode.NOT_FOUND);
  }

  if (!element) {
    return failure(t('externalSync.elementNotFound', { id: elementId }), ExitCode.NOT_FOUND);
  }

  if (element.type !== 'task' && element.type !== 'document') {
    return failure(t('externalSync.elementNotTaskOrDoc', { id: elementId, type: (element as any).type }), ExitCode.VALIDATION);
  }

  const hasExternalRef = (element as Task).externalRef;
  const hasExternalSync = (element.metadata as Record<string, unknown>)?._externalSync;
  if (!hasExternalRef && !hasExternalSync) {
    return failure(t('externalSync.elementNotLinked', { id: elementId }), ExitCode.VALIDATION);
  }

  // Clear externalRef and _externalSync metadata
  try {
    const existingMetadata = (element.metadata ?? {}) as Record<string, unknown>;
    const { _externalSync: _, ...restMetadata } = existingMetadata;
    await api.update(elementId as ElementId, {
      externalRef: undefined,
      metadata: restMetadata,
    } as Partial<Task | Document>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('externalSync.failedToUpdateElement', { message }), ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ elementId, elementType: element.type, unlinked: true });
  }

  if (mode === 'quiet') {
    return success(elementId);
  }

  return success(
    { elementId, unlinked: true },
    t('externalSync.unlink.unlinked', { elementType: element.type, elementId })
  );
}

// ============================================================================
// Unlink-All Command
// ============================================================================

interface UnlinkAllOptions {
  provider?: string;
  type?: string;
  'dry-run'?: boolean;
}

const unlinkAllOptions: CommandOption[] = [
  {
    name: 'provider',
    short: 'p',
    description: t('externalSync.unlinkAll.optionProvider'),
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: t('externalSync.unlinkAll.optionType'),
    hasValue: true,
    defaultValue: 'all',
  },
  {
    name: 'dry-run',
    short: 'n',
    description: t('externalSync.unlinkAll.optionDryRun'),
  },
];

async function unlinkAllHandler(
  _args: string[],
  options: GlobalOptions & UnlinkAllOptions
): Promise<CommandResult> {
  const providerFilter = options.provider;
  const typeFilter = options.type ?? 'all';
  const isDryRun = options['dry-run'] ?? false;

  if (typeFilter !== 'task' && typeFilter !== 'document' && typeFilter !== 'all') {
    return failure(
      t('externalSync.invalidTypeValue', { value: typeFilter }),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  // Gather linked elements based on type filter
  const linkedElements: Array<{ id: string; type: string; title: string; provider: string }> = [];

  const typesToQuery: string[] = [];
  if (typeFilter === 'all' || typeFilter === 'task') typesToQuery.push('task');
  if (typeFilter === 'all' || typeFilter === 'document') typesToQuery.push('document');

  for (const elType of typesToQuery) {
    try {
      const results = await api!.list({ type: elType as 'task' | 'document' });
      for (const el of results) {
        const metadata = ((el as Task | Document).metadata ?? {}) as Record<string, unknown>;
        const syncState = metadata._externalSync as ExternalSyncState | undefined;
        if (!syncState) continue;

        // Apply provider filter if specified
        if (providerFilter && syncState.provider !== providerFilter) continue;

        linkedElements.push({
          id: el.id,
          type: elType,
          title: (el as Task | Document).title ?? '(untitled)',
          provider: syncState.provider,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(t('externalSync.failedToListElements', { type: elType, message }), ExitCode.GENERAL_ERROR);
    }
  }

  const mode = getOutputMode(options);

  if (linkedElements.length === 0) {
    const result = { unlinked: 0, total: 0, dryRun: isDryRun };
    if (mode === 'json') {
      return success(result);
    }
    const providerHint = providerFilter ? ` lié(s) à « ${providerFilter} »` : '';
    const typeHint = typeFilter !== 'all' ? ` de type « ${typeFilter} »` : '';
    return success(result, t('externalSync.linkAll.noLinkedElementsFound', { typeHint, providerHint }));
  }

  // Dry run — just list elements that would be unlinked
  if (isDryRun) {
    const elementList = linkedElements.map((el) => ({
      id: el.id,
      type: el.type,
      title: el.title,
      provider: el.provider,
    }));

    const jsonResult: Record<string, unknown> = {
      dryRun: true,
      total: linkedElements.length,
      elements: elementList,
    };
    if (providerFilter) jsonResult.provider = providerFilter;
    if (typeFilter !== 'all') jsonResult.type = typeFilter;

    if (mode === 'json') {
      return success(jsonResult);
    }

    if (mode === 'quiet') {
      return success(String(linkedElements.length));
    }

    const lines: string[] = [];
    lines.push(t('externalSync.linkAll.dryRunUnlink', { count: linkedElements.length }));
    lines.push('');

    for (const el of linkedElements) {
      lines.push(`  ${el.id}  ${el.type.padEnd(10)} ${el.provider.padEnd(10)} ${el.title}`);
    }

    return success(jsonResult, lines.join('\n'));
  }

  // Actually unlink elements
  let totalUnlinked = 0;
  let totalFailed = 0;
  const progressLines: string[] = [];

  for (const el of linkedElements) {
    try {
      const element = await api!.get<Task | Document>(el.id as ElementId);
      if (!element) {
        totalFailed++;
        continue;
      }

      const existingMetadata = (element.metadata ?? {}) as Record<string, unknown>;
      const { _externalSync: _, ...restMetadata } = existingMetadata;
      await api!.update(el.id as ElementId, {
        externalRef: undefined,
        metadata: restMetadata,
      } as Partial<Task | Document>);

      totalUnlinked++;

      if (mode !== 'json' && mode !== 'quiet') {
        progressLines.push(`  ${t('externalSync.linkAll.unlinkedElement', { type: el.type, id: el.id, provider: el.provider, title: el.title })}`);
      }
    } catch (err) {
      totalFailed++;
      if (mode !== 'json' && mode !== 'quiet') {
        const message = err instanceof Error ? err.message : String(err);
        progressLines.push(`  ${t('externalSync.linkAll.failedToUnlinkElement', { type: el.type, id: el.id, message })}`);
      }
    }
  }

  const result: Record<string, unknown> = {
    unlinked: totalUnlinked,
    failed: totalFailed,
    total: linkedElements.length,
  };
  if (providerFilter) result.provider = providerFilter;
  if (typeFilter !== 'all') result.type = typeFilter;

  if (mode === 'json') {
    return success(result);
  }

  if (mode === 'quiet') {
    return success(String(totalUnlinked));
  }

  const lines: string[] = [...progressLines, ''];
  const summaryParts = [t('externalSync.linkAll.unlinkedSummary', { count: totalUnlinked })];
  if (totalFailed > 0) {
    summaryParts.push(t('externalSync.linkAll.failedCount', { count: totalFailed }));
  }
  lines.push(summaryParts.join(' '));

  return success(result, lines.join('\n'));
}

// ============================================================================
// Push Command
// ============================================================================

interface PushOptions {
  all?: boolean;
  force?: boolean;
  type?: string;
  'no-library'?: boolean;
}

const pushOptions: CommandOption[] = [
  {
    name: 'all',
    short: 'a',
    description: t('externalSync.push.optionAll'),
  },
  {
    name: 'force',
    short: 'f',
    description: t('externalSync.push.optionForce'),
  },
  {
    name: 'type',
    short: 't',
    description: t('externalSync.push.optionType'),
    hasValue: true,
    defaultValue: 'all',
  },
  {
    name: 'no-library',
    description: t('externalSync.push.optionNoLibrary'),
  },
];

async function pushHandler(
  args: string[],
  options: GlobalOptions & PushOptions
): Promise<CommandResult> {
  // Validate --type flag
  const typeError = validateTypeFlag(options.type);
  if (typeError) {
    return failure(typeError, ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Get settings service to create a configured sync engine
  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  if (settingsError) {
    return failure(settingsError, ExitCode.GENERAL_ERROR);
  }

  const syncSettings = settingsService.getExternalSyncSettings();
  const providerConfigs = Object.values(syncSettings.providers).filter(
    (p): p is ProviderConfigLike & { token: string } => !!p.token
  );

  if (providerConfigs.length === 0) {
    return failure(
      t('externalSync.noProviders'),
      ExitCode.GENERAL_ERROR
    );
  }

  // Build sync options
  const { createSyncEngine, createConfiguredProviderRegistry } = await import('../../external-sync/index.js');
  const registry = createConfiguredProviderRegistry(
    providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    }))
  );

  const engine = createSyncEngine({
    api,
    registry,
    settings: settingsService,
    providerConfigs: providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    })),
  });

  // Build push options
  const adapterTypes = parseTypeFlag(options.type);
  const mode = getOutputMode(options);

  // Progress bar — created lazily once total is known (via onProgress callback)
  let pushProgress = nullProgressBar;
  const onProgress = mode === 'json' || mode === 'quiet'
    ? undefined
    : (current: number, total: number) => {
        if (current === 0 && total > 0) {
          // First call — create the progress bar now that we know the total
          pushProgress = createProgressBar(total, t('externalSync.push.pushing'));
        }
        pushProgress.update(current);
      };

  const syncPushOptions: { taskIds?: string[]; all?: boolean; force?: boolean; adapterTypes?: SyncAdapterType[]; includeNoLibrary?: boolean; onBeforeProcess?: (count: number) => void; onProgress?: (current: number, total: number) => void } = {};
  if (adapterTypes) {
    syncPushOptions.adapterTypes = adapterTypes;
  }
  if (options.all) {
    syncPushOptions.all = true;
  } else if (args.length > 0) {
    syncPushOptions.taskIds = args;
  } else {
    return failure(
      t('externalSync.push.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }
  if (options.force) {
    syncPushOptions.force = true;
  }
  if (options['no-library']) {
    syncPushOptions.includeNoLibrary = true;
  }
  if (onProgress) {
    syncPushOptions.onProgress = onProgress;
  }

  // Show warning for large element sets before processing begins
  if (mode !== 'json' && mode !== 'quiet') {
    syncPushOptions.onBeforeProcess = (count: number) => {
      if (count > LARGE_SET_WARNING_THRESHOLD) {
        process.stderr.write(
          `\n${t('externalSync.largeSetWarning', { count })}\n\n`
        );
      }
    };
  }

  try {
    const result = await engine.push(syncPushOptions);
    pushProgress.finish();

    const output: Record<string, unknown> = {
      success: result.success,
      pushed: result.pushed,
      skipped: result.skipped,
      errors: result.errors,
      conflicts: result.conflicts,
    };
    if (result.noLibrarySkipped && result.noLibrarySkipped > 0) {
      output.noLibrarySkipped = result.noLibrarySkipped;
    }

    if (mode === 'json') {
      return success(output);
    }

    if (mode === 'quiet') {
      return success(String(result.pushed));
    }

    const typeLabel = options.type === 'document' ? 'document(s)' : options.type === 'task' ? 'task(s)' : 'element(s)';
    const lines: string[] = [
      t('externalSync.push.result', { count: result.pushed, typeLabel }),
      '',
    ];

    if (result.skipped > 0) {
      lines.push(t('externalSync.push.skipped', { count: result.skipped }));
    }

    if (result.noLibrarySkipped && result.noLibrarySkipped > 0) {
      lines.push(t('externalSync.push.skippedNoLibrary', { count: result.noLibrarySkipped }));
    }

    if (result.errors.length > 0) {
      lines.push('');
      lines.push(t('externalSync.push.errors', { count: result.errors.length }));
      for (const err of result.errors) {
        lines.push(`  ${err.elementId ?? 'unknown'}: ${err.message}`);
      }
    }

    if (result.conflicts.length > 0) {
      lines.push('');
      lines.push(t('externalSync.push.conflicts', { count: result.conflicts.length }));
      for (const conflict of result.conflicts) {
        lines.push(`  ${conflict.elementId} ↔ ${conflict.externalId} (${conflict.strategy}, resolved: ${conflict.resolved})`);
      }
    }

    return success(output, lines.join('\n'));
  } catch (err) {
    pushProgress.finish();
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('externalSync.push.pushFailedGeneral', { message }), ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Pull Command
// ============================================================================

interface PullOptions {
  provider?: string;
  discover?: boolean;
  type?: string;
}

const pullOptions: CommandOption[] = [
  {
    name: 'provider',
    short: 'p',
    description: t('externalSync.pull.optionProvider'),
    hasValue: true,
  },
  {
    name: 'discover',
    short: 'd',
    description: t('externalSync.pull.optionDiscover'),
  },
  {
    name: 'type',
    short: 't',
    description: t('externalSync.pull.optionType'),
    hasValue: true,
    defaultValue: 'all',
  },
];

async function pullHandler(
  _args: string[],
  options: GlobalOptions & PullOptions
): Promise<CommandResult> {
  // Validate --type flag
  const typeError = validateTypeFlag(options.type);
  if (typeError) {
    return failure(typeError, ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  if (settingsError) {
    return failure(settingsError, ExitCode.GENERAL_ERROR);
  }

  const settings = settingsService.getExternalSyncSettings();
  const providerNames = options.provider
    ? [options.provider]
    : Object.keys(settings.providers);

  if (providerNames.length === 0) {
    return failure(
      t('externalSync.noProvidersConfigured'),
      ExitCode.VALIDATION
    );
  }

  // Validate providers have tokens and build provider configs
  const providerConfigs: Array<{ provider: string; token: string; apiBaseUrl?: string; defaultProject?: string }> = [];
  const invalidProviders: string[] = [];

  for (const name of providerNames) {
    const config = settings.providers[name];
    if (config?.token) {
      providerConfigs.push({
        provider: config.provider,
        token: config.token,
        apiBaseUrl: config.apiBaseUrl,
        defaultProject: config.defaultProject,
      });
    } else {
      invalidProviders.push(name);
    }
  }

  if (providerConfigs.length === 0) {
    return failure(
      t('externalSync.noProvidersWithTokens'),
      ExitCode.GENERAL_ERROR
    );
  }

  // Create sync engine (same pattern as pushHandler)
  const { createSyncEngine, createConfiguredProviderRegistry } = await import('../../external-sync/index.js');
  const registry = createConfiguredProviderRegistry(
    providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    }))
  );

  const engine = createSyncEngine({
    api,
    registry,
    settings: settingsService,
    providerConfigs: providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    })),
  });

  // Build pull options — discover maps to 'all' to create local tasks for unlinked external issues
  const adapterTypes = parseTypeFlag(options.type);
  const syncPullOptions: { all?: boolean; adapterTypes?: SyncAdapterType[] } = {};
  if (adapterTypes) {
    syncPullOptions.adapterTypes = adapterTypes;
  }
  if (options.discover) {
    syncPullOptions.all = true;
  }

  try {
    const result = await engine.pull(syncPullOptions);

    const mode = getOutputMode(options);
    const output = {
      success: result.success,
      pulled: result.pulled,
      skipped: result.skipped,
      errors: result.errors,
      conflicts: result.conflicts,
      invalidProviders,
    };

    if (mode === 'json') {
      return success(output);
    }

    if (mode === 'quiet') {
      return success(String(result.pulled));
    }

    const typeLabel = options.type === 'document' ? 'document(s)' : options.type === 'task' ? 'task(s)' : 'element(s)';
    const lines: string[] = [
      t('externalSync.pull.result', { count: result.pulled, typeLabel }),
      '',
    ];

    if (result.skipped > 0) {
      lines.push(t('externalSync.pull.skipped', { count: result.skipped }));
    }

    if (invalidProviders.length > 0) {
      lines.push('');
      lines.push(t('externalSync.skippedProvidersNoToken', { providers: invalidProviders.join(', ') }));
    }

    if (result.errors.length > 0) {
      lines.push('');
      lines.push(t('externalSync.pull.errors', { count: result.errors.length }));
      for (const err of result.errors) {
        lines.push(`  ${err.elementId ?? 'unknown'}: ${err.message}`);
      }
    }

    if (result.conflicts.length > 0) {
      lines.push('');
      lines.push(t('externalSync.pull.conflicts', { count: result.conflicts.length }));
      for (const conflict of result.conflicts) {
        lines.push(`  ${conflict.elementId} ↔ ${conflict.externalId} (${conflict.strategy}, resolved: ${conflict.resolved})`);
      }
    }

    return success(output, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('externalSync.pull.pullFailedGeneral', { message }), ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Sync Command (bidirectional)
// ============================================================================

interface SyncOptions {
  'dry-run'?: boolean;
  type?: string;
}

const syncOptions: CommandOption[] = [
  {
    name: 'dry-run',
    short: 'n',
    description: t('externalSync.sync.optionDryRun'),
  },
  {
    name: 'type',
    short: 't',
    description: t('externalSync.sync.optionType'),
    hasValue: true,
    defaultValue: 'all',
  },
];

async function syncHandler(
  _args: string[],
  options: GlobalOptions & SyncOptions
): Promise<CommandResult> {
  // Validate --type flag
  const typeError = validateTypeFlag(options.type);
  if (typeError) {
    return failure(typeError, ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  if (settingsError) {
    return failure(settingsError, ExitCode.GENERAL_ERROR);
  }

  const syncSettings = settingsService.getExternalSyncSettings();
  const isDryRun = options['dry-run'] ?? false;

  const providerConfigs = Object.values(syncSettings.providers).filter(
    (p): p is ProviderConfigLike & { token: string } => !!p.token
  );

  if (providerConfigs.length === 0) {
    return failure(
      t('externalSync.noProviders'),
      ExitCode.GENERAL_ERROR
    );
  }

  // Create sync engine (same pattern as pushHandler)
  const { createSyncEngine, createConfiguredProviderRegistry } = await import('../../external-sync/index.js');
  const registry = createConfiguredProviderRegistry(
    providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    }))
  );

  const engine = createSyncEngine({
    api,
    registry,
    settings: settingsService,
    providerConfigs: providerConfigs.map((p) => ({
      provider: p.provider,
      token: p.token,
      apiBaseUrl: p.apiBaseUrl,
      defaultProject: p.defaultProject,
    })),
  });

  // Build sync options
  const adapterTypes = parseTypeFlag(options.type);
  const syncOpts: { dryRun?: boolean; adapterTypes?: SyncAdapterType[] } = {};
  if (adapterTypes) {
    syncOpts.adapterTypes = adapterTypes;
  }
  if (isDryRun) {
    syncOpts.dryRun = true;
  }

  try {
    const result = await engine.sync(syncOpts);

    const mode = getOutputMode(options);
    const output = {
      success: result.success,
      dryRun: isDryRun,
      pushed: result.pushed,
      pulled: result.pulled,
      skipped: result.skipped,
      errors: result.errors,
      conflicts: result.conflicts,
    };

    if (mode === 'json') {
      return success(output);
    }

    if (mode === 'quiet') {
      return success(`${result.pushed}/${result.pulled}`);
    }

    const typeLabel = options.type === 'document' ? 'document(s)' : options.type === 'task' ? 'task(s)' : 'element(s)';
    const lines: string[] = [
      isDryRun ? t('externalSync.sync.dryRunTitle') : t('externalSync.sync.completeTitle'),
      '',
      t('externalSync.sync.pushed', { count: result.pushed, typeLabel }),
      t('externalSync.sync.pulled', { count: result.pulled, typeLabel }),
    ];

    if (result.skipped > 0) {
      lines.push(t('externalSync.sync.skipped', { count: result.skipped }));
    }

    if (result.errors.length > 0) {
      lines.push('');
      lines.push(t('externalSync.sync.errors', { count: result.errors.length }));
      for (const err of result.errors) {
        lines.push(`  ${err.elementId ?? 'unknown'}: ${err.message}`);
      }
    }

    if (result.conflicts.length > 0) {
      lines.push('');
      lines.push(t('externalSync.sync.conflicts', { count: result.conflicts.length }));
      for (const conflict of result.conflicts) {
        lines.push(`  ${conflict.elementId} ↔ ${conflict.externalId} (${conflict.strategy}, resolved: ${conflict.resolved})`);
      }
    }

    return success(output, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('externalSync.sync.syncFailedGeneral', { message }), ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Status Command
// ============================================================================

async function statusHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { settingsService, error: settingsError } = await createSettingsServiceFromOptions(options);
  if (settingsError) {
    return failure(settingsError, ExitCode.GENERAL_ERROR);
  }

  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  const settings = settingsService.getExternalSyncSettings();
  const enabled = getValue('externalSync.enabled');

  // Count linked tasks and documents, and check for conflicts
  let linkedTaskCount = 0;
  let linkedDocCount = 0;
  let conflictCount = 0;
  const providerTaskCounts: Record<string, number> = {};
  const providerDocCounts: Record<string, number> = {};

  try {
    const allTasks = await api.list({ type: 'task' });
    for (const t of allTasks) {
      const task = t as Task;
      if (task.externalRef && (task.metadata as Record<string, unknown>)?._externalSync) {
        linkedTaskCount++;
        const syncMeta = (task.metadata as Record<string, unknown>)._externalSync as Record<string, unknown>;
        const provider = (syncMeta?.provider as string) ?? 'unknown';
        providerTaskCounts[provider] = (providerTaskCounts[provider] ?? 0) + 1;
      }
      if (task.tags?.includes('sync-conflict')) {
        conflictCount++;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('externalSync.failedToListTasks', { message }), ExitCode.GENERAL_ERROR);
  }

  try {
    const allDocs = await api.list({ type: 'document' });
    for (const d of allDocs) {
      const doc = d as Document;
      if ((doc.metadata as Record<string, unknown>)?._externalSync) {
        linkedDocCount++;
        const syncMeta = (doc.metadata as Record<string, unknown>)._externalSync as Record<string, unknown>;
        const provider = (syncMeta?.provider as string) ?? 'unknown';
        providerDocCounts[provider] = (providerDocCounts[provider] ?? 0) + 1;
      }
    }
  } catch {
    // If listing documents fails, continue with task counts only
  }

  // Build cursor info
  const cursors: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings.syncCursors)) {
    cursors[key] = value;
  }

  const mode = getOutputMode(options);
  const statusData = {
    enabled,
    linkedTaskCount,
    linkedDocumentCount: linkedDocCount,
    conflictCount,
    providerTaskCounts,
    providerDocumentCounts: providerDocCounts,
    configuredProviders: Object.keys(settings.providers),
    syncCursors: cursors,
    pollIntervalMs: settings.pollIntervalMs,
    defaultDirection: settings.defaultDirection,
  };

  if (mode === 'json') {
    return success(statusData);
  }

  if (mode === 'quiet') {
    return success(`${linkedTaskCount}:${linkedDocCount}:${conflictCount}`);
  }

  const lines: string[] = [
    t('externalSync.status.title'),
    '',
    `  ${t('externalSync.status.enabled')}:             ${enabled ? t('externalSync.config.yes') : t('externalSync.config.no')}`,
    `  ${t('externalSync.status.linkedTasks')}:        ${linkedTaskCount}`,
    `  ${t('externalSync.status.linkedDocs')}:    ${linkedDocCount}`,
    `  ${t('externalSync.status.pendingConflicts')}:   ${conflictCount}`,
    `  ${t('externalSync.status.pollInterval')}:       ${settings.pollIntervalMs}ms`,
    `  ${t('externalSync.status.defaultDirection')}:   ${settings.defaultDirection}`,
    '',
  ];

  // Provider breakdown
  const providerEntries = Object.entries(settings.providers);
  if (providerEntries.length > 0) {
    lines.push(`  ${t('externalSync.status.providers')}:`);
    for (const [name, config] of providerEntries) {
      const taskCount = providerTaskCounts[name] ?? 0;
      const docCount = providerDocCounts[name] ?? 0;
      const hasToken = config.token ? t('externalSync.config.yes') : t('externalSync.config.no');
      lines.push(`    ${name}: ${t('externalSync.status.linkedTaskCount', { count: taskCount })}, ${t('externalSync.status.linkedDocCount', { count: docCount })}, ${t('externalSync.status.token')}: ${hasToken}, ${t('externalSync.status.project')}: ${config.defaultProject ?? t('externalSync.status.notSet')}`);
    }
  } else {
    lines.push(`  ${t('externalSync.status.providers')}: ${t('externalSync.status.noneConfigured')}`);
  }

  // Sync cursors
  const cursorEntries = Object.entries(cursors);
  if (cursorEntries.length > 0) {
    lines.push('');
    lines.push(`  ${t('externalSync.status.lastSyncCursors')}:`);
    for (const [key, value] of cursorEntries) {
      lines.push(`    ${key}: ${value}`);
    }
  }

  if (conflictCount > 0) {
    lines.push('');
    lines.push(`  ⚠ ${t('externalSync.status.conflictsNeedResolution', { count: conflictCount })}`);
  }

  return success(statusData, lines.join('\n'));
}

// ============================================================================
// Resolve Command
// ============================================================================

interface ResolveOptions {
  keep?: string;
}

const resolveOptions: CommandOption[] = [
  {
    name: 'keep',
    short: 'k',
    description: t('externalSync.resolve.optionKeep'),
    hasValue: true,
    required: true,
  },
];

async function resolveHandler(
  args: string[],
  options: GlobalOptions & ResolveOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('externalSync.resolve.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [elementId] = args;
  const keep = options.keep;

  if (!keep || (keep !== 'local' && keep !== 'remote')) {
    return failure(
      t('externalSync.keepFlagRequired'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  // Resolve element (task or document)
  let element: Task | Document | null;
  try {
    element = await api.get<Task | Document>(elementId as ElementId);
  } catch {
    return failure(t('externalSync.elementNotFound', { id: elementId }), ExitCode.NOT_FOUND);
  }

  if (!element) {
    return failure(t('externalSync.elementNotFound', { id: elementId }), ExitCode.NOT_FOUND);
  }

  if (element.type !== 'task' && element.type !== 'document') {
    return failure(t('externalSync.elementNotTaskOrDoc', { id: elementId, type: (element as any).type }), ExitCode.VALIDATION);
  }

  const elementTags = (element as Task).tags;
  if (!elementTags?.includes('sync-conflict')) {
    return failure(
      t('externalSync.elementNoConflict', { id: elementId }),
      ExitCode.VALIDATION
    );
  }

  // Remove sync-conflict tag and update metadata
  try {
    const newTags = (elementTags ?? []).filter((t) => t !== 'sync-conflict');
    const existingMetadata = (element.metadata ?? {}) as Record<string, unknown>;
    const syncMeta = (existingMetadata._externalSync ?? {}) as Record<string, unknown>;

    // Record resolution in metadata
    const updatedSyncMeta = {
      ...syncMeta,
      lastConflictResolution: {
        resolvedAt: new Date().toISOString(),
        kept: keep,
      },
    };

    // Clear conflict data from metadata
    const { _syncConflict: _, ...restMetadata } = existingMetadata;

    await api.update(elementId as ElementId, {
      tags: newTags,
      metadata: {
        ...restMetadata,
        _externalSync: updatedSyncMeta,
      },
    } as Partial<Task | Document>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('externalSync.failedToResolveConflict', { message }), ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);

  if (mode === 'json') {
    return success({ elementId, elementType: element.type, resolved: true, kept: keep });
  }

  if (mode === 'quiet') {
    return success(elementId);
  }

  return success(
    { elementId, resolved: true, kept: keep },
    t('externalSync.resolve.resolved', { type: element.type, id: elementId, kept: keep })
  );
}

// ============================================================================
// Link-All Command
// ============================================================================

interface LinkAllOptions {
  provider?: string;
  project?: string;
  status?: string | string[];
  'dry-run'?: boolean;
  'batch-size'?: string;
  force?: boolean;
  type?: string;
  'no-library'?: boolean;
  /** @internal Dependency injection for testing — overrides createProviderFromSettings */
  _providerFactory?: (
    providerName: string,
    projectOverride: string | undefined,
    options: GlobalOptions
  ) => Promise<{
    provider?: ExternalProvider;
    project?: string;
    direction?: SyncDirection;
    error?: string;
  }>;
}

const linkAllOptions: CommandOption[] = [
  {
    name: 'provider',
    short: 'p',
    description: t('externalSync.linkAll.optionProvider'),
    hasValue: true,
    required: true,
  },
  {
    name: 'project',
    description: t('externalSync.linkAll.optionProject'),
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: t('externalSync.linkAll.optionStatus'),
    hasValue: true,
    array: true,
  },
  {
    name: 'dry-run',
    short: 'n',
    description: t('externalSync.linkAll.optionDryRun'),
  },
  {
    name: 'batch-size',
    short: 'b',
    description: t('externalSync.linkAll.optionBatchSize'),
    hasValue: true,
    defaultValue: '10',
  },
  {
    name: 'force',
    short: 'f',
    description: t('externalSync.linkAll.optionForce'),
  },
  {
    name: 'type',
    short: 't',
    description: t('externalSync.linkAll.optionType'),
    hasValue: true,
    defaultValue: 'task',
  },
  {
    name: 'no-library',
    description: t('externalSync.linkAll.optionNoLibrary'),
  },
];

/**
 * Helper to detect rate limit errors from GitHub or Linear providers.
 * Returns the reset timestamp (epoch seconds) if available, or undefined.
 */
function isRateLimitError(err: unknown): { isRateLimit: boolean; resetAt?: number } {
  // Try GitHub error shape
  if (
    err &&
    typeof err === 'object' &&
    'isRateLimited' in err &&
    (err as { isRateLimited: boolean }).isRateLimited
  ) {
    const rateLimit = (err as { rateLimit?: { reset?: number } | null }).rateLimit;
    return { isRateLimit: true, resetAt: rateLimit?.reset };
  }
  // Also check error message for rate limit keywords
  if (err instanceof Error && /rate.limit/i.test(err.message)) {
    return { isRateLimit: true };
  }
  return { isRateLimit: false };
}

/**
 * Extracts validation error details from a GitHub API error response.
 * GitHub's 422 responses include an `errors` array with `resource`, `field`,
 * `code`, and sometimes `value` or `message` entries.
 *
 * Example output: "invalid label: sf:priority:high"
 */
function extractValidationDetail(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;

  const responseBody = (err as { responseBody?: Record<string, unknown> | null }).responseBody;
  if (!responseBody || !Array.isArray(responseBody.errors)) return null;

  const details = (responseBody.errors as Array<Record<string, unknown>>)
    .map((e) => {
      const parts: string[] = [];
      if (e.code && typeof e.code === 'string') parts.push(e.code);
      if (e.field && typeof e.field === 'string') parts.push(e.field as string);
      if (e.value !== undefined) parts.push(String(e.value));
      if (e.message && typeof e.message === 'string') parts.push(e.message as string);
      return parts.join(': ');
    })
    .filter(Boolean);

  return details.length > 0 ? details.join('; ') : null;
}

/**
 * Creates an ExternalProvider instance from settings for the given provider name.
 * Returns the provider, project, and direction, or an error message.
 */
async function createProviderFromSettings(
  providerName: string,
  projectOverride: string | undefined,
  options: GlobalOptions
): Promise<{
  provider?: ExternalProvider;
  project?: string;
  direction?: SyncDirection;
  error?: string;
}> {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return { error: t('db.noDatabase') };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);

    // Dynamic import to handle optional peer dependency
    // @ts-ignore — smithy is an optional runtime dependency, may not be installed
    const { createSettingsService } = await import('@stoneforge/smithy/services');
    // @ts-ignore — StorageBackend type may differ across compilation units (local source vs global dist)
    const settingsService = createSettingsService(backend) as {
      getProviderConfig(provider: string): { provider: string; token?: string; apiBaseUrl?: string; defaultProject?: string } | undefined;
    };

    const providerConfig = settingsService.getProviderConfig(providerName);
    const isTokenless = TOKENLESS_PROVIDERS.has(providerName);

    // Token-free providers (e.g., folder) only need a config entry — no token required.
    // All other providers require both a config entry and a token.
    if (!providerConfig) {
      if (isTokenless) {
        return { error: t('externalSync.providerNotConfigured', { provider: providerName }) };
      }
      return { error: t('externalSync.providerNoToken', { provider: providerName }) };
    }
    if (!isTokenless && !providerConfig.token) {
      return { error: t('externalSync.providerNoToken', { provider: providerName }) };
    }

    const project = projectOverride ?? providerConfig?.defaultProject;
    if (!project) {
      return { error: t('externalSync.providerNoProject', { provider: providerName }) };
    }

    let provider: ExternalProvider;

    // Token is guaranteed non-undefined for non-tokenless providers (validated above)
    if (providerName === 'github') {
      const { createGitHubProvider } = await import('../../external-sync/providers/github/index.js');
      provider = createGitHubProvider({
        provider: 'github',
        token: providerConfig.token!,
        apiBaseUrl: providerConfig.apiBaseUrl,
        defaultProject: project,
      });
    } else if (providerName === 'linear') {
      const { createLinearProvider } = await import('../../external-sync/providers/linear/index.js');
      provider = createLinearProvider({
        apiKey: providerConfig.token!,
      });
    } else if (providerName === 'notion') {
      const { createNotionProvider } = await import('../../external-sync/providers/notion/index.js');
      provider = createNotionProvider({
        token: providerConfig.token!,
      });
    } else if (providerName === 'folder') {
      const { createFolderProvider } = await import('../../external-sync/providers/folder/index.js');
      provider = createFolderProvider();
    } else {
      return { error: t('externalSync.unsupportedProvider', { provider: providerName }) };
    }

    const direction = (getValue('externalSync.defaultDirection') ?? 'bidirectional') as SyncDirection;

    return { provider, project, direction };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Cannot find') || message.includes('MODULE_NOT_FOUND')) {
      return { error: t('externalSync.requiresSmithy') };
    }
    return { error: t('externalSync.failedToInitProvider', { message }) };
  }
}

/**
 * Process a batch of tasks: create external issues and link them.
 * Uses the adapter's field mapping to include priority, taskType, and status
 * labels on the created external issues.
 */
async function processBatch(
  tasks: Task[],
  adapter: TaskSyncAdapter,
  api: ReturnType<typeof createAPI>['api'],
  providerName: string,
  project: string,
  direction: SyncDirection,
  progressLines: string[]
): Promise<{ succeeded: number; failed: number; rateLimited: boolean; resetAt?: number }> {
  let succeeded = 0;
  let failed = 0;
  let rateLimited = false;
  let resetAt: number | undefined;
  const fieldMapConfig = getFieldMapConfigForProvider(providerName);

  for (const task of tasks) {
    try {
      // Build the complete external task input using field mapping.
      // This maps priority → sf:priority:* labels, taskType → sf:type:* labels,
      // status → open/closed state, user tags → labels, and hydrates description.
      const externalInput = await taskToExternalTask(task, fieldMapConfig, api!);

      // Create the external issue with fully mapped fields
      const externalTask = await adapter.createIssue(project, externalInput);

      // Build the ExternalSyncState metadata
      const syncState: ExternalSyncState = {
        provider: providerName,
        project,
        externalId: externalTask.externalId,
        url: externalTask.url,
        direction,
        adapterType: 'task',
      };

      // Update the task with externalRef and _externalSync metadata
      const existingMetadata = (task.metadata ?? {}) as Record<string, unknown>;
      await api!.update<Task>(task.id as unknown as ElementId, {
        externalRef: externalTask.url,
        metadata: {
          ...existingMetadata,
          _externalSync: syncState,
        },
      } as Partial<Task>);

      progressLines.push(t('externalSync.linkAll.linkedElement', { id: task.id, url: externalTask.url }));
      succeeded++;
    } catch (err) {
      // Check for rate limit errors
      const rlCheck = isRateLimitError(err);
      if (rlCheck.isRateLimit) {
        rateLimited = true;
        resetAt = rlCheck.resetAt;
        const message = err instanceof Error ? err.message : String(err);
        progressLines.push(t('externalSync.rateLimitHitWhileLinking', { id: task.id, message }));
        // Stop processing further tasks in this batch
        break;
      }

      // Log warning and continue with next task
      const message = err instanceof Error ? err.message : String(err);
      const detail = extractValidationDetail(err);
      progressLines.push(
        detail
          ? t('externalSync.linkAll.failedToLinkElementDetail', { id: task.id, message, detail })
          : t('externalSync.linkAll.failedToLinkElement', { id: task.id, message })
      );
      failed++;
    }
  }

  return { succeeded, failed, rateLimited, resetAt };
}

/**
 * Process a batch of documents: create external pages and link them.
 */
async function processDocumentBatch(
  docs: Document[],
  adapter: DocumentSyncAdapter,
  api: ReturnType<typeof createAPI>['api'],
  providerName: string,
  project: string,
  direction: SyncDirection,
  progressLines: string[]
): Promise<{ succeeded: number; failed: number; rateLimited: boolean; resetAt?: number }> {
  let succeeded = 0;
  let failed = 0;
  let rateLimited = false;
  let resetAt: number | undefined;

  for (const doc of docs) {
    try {
      // Resolve library path for directory-based organization
      let libraryPath: string | undefined;
      try {
        libraryPath = await resolveDocumentLibraryPath(
          api! as unknown as LibraryPathAPI,
          doc.id as unknown as ElementId
        );
      } catch {
        // If library path resolution fails, continue without it
        // (document will be placed in project root)
      }

      // Convert document to external document input (with library path)
      const externalInput = documentToExternalDocumentInput(doc, libraryPath);

      // Create the external page
      const externalDoc = await adapter.createPage(project, externalInput);

      // Build the ExternalSyncState metadata
      const syncState: ExternalSyncState = {
        provider: providerName,
        project,
        externalId: externalDoc.externalId,
        url: externalDoc.url,
        direction,
        adapterType: 'document',
      };

      // Update the document with externalRef and _externalSync metadata
      const existingMetadata = (doc.metadata ?? {}) as Record<string, unknown>;
      await api!.update(doc.id as unknown as ElementId, {
        externalRef: externalDoc.url,
        metadata: {
          ...existingMetadata,
          _externalSync: syncState,
        },
      } as Partial<Document>);

      progressLines.push(t('externalSync.linkAll.linkedElement', { id: doc.id, url: externalDoc.url }));
      succeeded++;
    } catch (err) {
      // Check for rate limit errors
      const rlCheck = isRateLimitError(err);
      if (rlCheck.isRateLimit) {
        rateLimited = true;
        resetAt = rlCheck.resetAt;
        const message = err instanceof Error ? err.message : String(err);
        progressLines.push(t('externalSync.rateLimitHitWhileLinking', { id: doc.id, message }));
        break;
      }

      const message = err instanceof Error ? err.message : String(err);
      const detail = extractValidationDetail(err);
      progressLines.push(
        detail
          ? t('externalSync.linkAll.failedToLinkElementDetail', { id: doc.id, message, detail })
          : t('externalSync.linkAll.failedToLinkElement', { id: doc.id, message })
      );
      failed++;
    }
  }

  return { succeeded, failed, rateLimited, resetAt };
}

/**
 * Handle link-all for documents.
 * Queries all documents, filters out system categories and already-linked ones,
 * then creates external pages for each via the document adapter.
 */
async function linkAllDocumentsHandler(
  options: GlobalOptions & LinkAllOptions
): Promise<CommandResult> {
  const providerName = options.provider!;
  const isDryRun = options['dry-run'] ?? false;
  const force = options.force ?? false;
  const batchSize = parseInt(options['batch-size'] ?? '10', 10);
  if (isNaN(batchSize) || batchSize < 1) {
    return failure(t('externalSync.batchSizePositive'), ExitCode.INVALID_ARGUMENTS);
  }

  // Parse status filters
  const statusFilters: string[] = [];
  if (options.status) {
    if (Array.isArray(options.status)) {
      statusFilters.push(...options.status);
    } else {
      statusFilters.push(options.status);
    }
  }

  // Get API for querying/updating documents
  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  // Query all documents
  let allDocs: Document[];
  try {
    const results = await api!.list({ type: 'document' });
    allDocs = results as Document[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('externalSync.failedToListElements', { type: 'document', message }), ExitCode.GENERAL_ERROR);
  }

  // Filter out system categories and untitled documents
  allDocs = allDocs.filter((doc) => isSyncableDocument(doc));

  // Filter documents: unlinked docs, plus (with --force) docs linked to any provider
  let relinkedFromProvider: string | undefined;
  let relinkCount = 0;
  let docsToLink = allDocs.filter((doc) => {
    const metadata = (doc.metadata ?? {}) as Record<string, unknown>;
    const syncState = metadata._externalSync as ExternalSyncState | undefined;

    if (!syncState) {
      return true;
    }

    if (force) {
      // Re-link regardless of current provider
      if (syncState.provider !== providerName) {
        relinkedFromProvider = syncState.provider;
      }
      relinkCount++;
      return true;
    }

    return false;
  });

  // Apply status filter if specified (documents use 'active'/'archived')
  if (statusFilters.length > 0) {
    docsToLink = docsToLink.filter((doc) => statusFilters.includes(doc.status));
  }

  // Skip archived documents by default
  docsToLink = docsToLink.filter((doc) => doc.status !== 'archived');

  // Filter out documents not in any library (unless --no-library is set)
  let noLibrarySkipped = 0;
  if (!options['no-library'] && docsToLink.length > 0) {
    const libraryPaths = await resolveDocumentLibraryPaths(api!, docsToLink.map(d => d.id));
    const beforeCount = docsToLink.length;
    docsToLink = docsToLink.filter((doc) => libraryPaths.has(doc.id));
    noLibrarySkipped = beforeCount - docsToLink.length;
  }

  const mode = getOutputMode(options);

  if (docsToLink.length === 0) {
    const result: Record<string, unknown> = { linked: 0, failed: 0, skipped: 0, total: 0, dryRun: isDryRun, type: 'document' };
    if (noLibrarySkipped > 0) {
      result.noLibrarySkipped = noLibrarySkipped;
    }
    if (mode === 'json') {
      return success(result);
    }
    const hints: string[] = [];
    if (force) {
      hints.push(t('externalSync.linkAll.noDocsToRelink'));
    } else {
      hints.push(t('externalSync.linkAll.noUnlinkedDocs'));
    }
    if (noLibrarySkipped > 0) {
      hints.push(t('externalSync.linkAll.skippedNoLibrary', { count: noLibrarySkipped }));
    }
    return success(result, hints.join('\n'));
  }

  // Dry run — just list documents that would be linked
  if (isDryRun) {
    const docList = docsToLink.map((d) => ({
      id: d.id,
      title: d.title ?? '(untitled)',
      status: d.status,
      category: d.category,
    }));

    const jsonResult: Record<string, unknown> = {
      dryRun: true,
      provider: providerName,
      type: 'document',
      total: docsToLink.length,
      documents: docList,
    };
    if (force && relinkCount > 0) {
      jsonResult.force = true;
      jsonResult.relinkCount = relinkCount;
      jsonResult.relinkFromProvider = relinkedFromProvider;
    }
    if (noLibrarySkipped > 0) {
      jsonResult.noLibrarySkipped = noLibrarySkipped;
    }

    if (mode === 'json') {
      return success(jsonResult);
    }

    if (mode === 'quiet') {
      return success(String(docsToLink.length));
    }

    const lines: string[] = [];
    if (force && relinkCount > 0) {
      lines.push(
        t('externalSync.linkAll.dryRunRelinkDocs', { count: relinkCount, from: relinkedFromProvider, to: providerName })
      );
      const newCount = docsToLink.length - relinkCount;
      if (newCount > 0) {
        lines.push(t('externalSync.linkAll.dryRunPlusDocs', { count: newCount }));
      }
    } else {
      lines.push(t('externalSync.linkAll.dryRunDocs', { count: docsToLink.length, provider: providerName }));
    }
    if (noLibrarySkipped > 0) {
      lines.push(t('externalSync.linkAll.skippedNoLibrary', { count: noLibrarySkipped }));
    }
    lines.push('');

    for (const doc of docsToLink) {
      lines.push(`  ${doc.id}  ${doc.status.padEnd(12)} ${doc.category.padEnd(16)} ${doc.title ?? '(untitled)'}`);
    }

    return success(jsonResult, lines.join('\n'));
  }

  // Warn about large element sets (skip for json/quiet — already handled above)
  if (docsToLink.length > LARGE_SET_WARNING_THRESHOLD && mode !== 'json' && mode !== 'quiet') {
    process.stderr.write(
      `\n${t('externalSync.largeSetWarningDocs', { count: docsToLink.length })}\n\n`
    );
  }

  // Create provider for actual linking (supports DI for testing)
  const providerFactory = options._providerFactory ?? createProviderFromSettings;
  const {
    provider: externalProvider,
    project,
    direction,
    error: providerError,
  } = await providerFactory(providerName, options.project, options);

  if (providerError) {
    return failure(providerError, ExitCode.GENERAL_ERROR);
  }

  // Get the document adapter
  const docAdapter = externalProvider!.getDocumentAdapter?.();
  if (!docAdapter) {
    return failure(
      t('externalSync.providerNoDocumentSync', { provider: providerName }),
      ExitCode.GENERAL_ERROR
    );
  }

  const progressLines: string[] = [];

  // Log re-linking info when using --force
  if (force && relinkCount > 0 && mode !== 'json' && mode !== 'quiet') {
    progressLines.push(
      t('externalSync.linkAll.relinkingDocs', { count: relinkCount, from: relinkedFromProvider, to: providerName })
    );
    const newCount = docsToLink.length - relinkCount;
    if (newCount > 0) {
      progressLines.push(t('externalSync.linkAll.linkingDocs', { count: newCount }));
    }
    progressLines.push('');
  }

  // Progress bar — only in default/verbose human-readable output mode
  const progress = mode === 'json' || mode === 'quiet'
    ? nullProgressBar
    : createProgressBar(docsToLink.length, t('externalSync.linkAll.linkingDocsProgress'));

  // Process documents in batches
  let totalSucceeded = 0;
  let totalFailed = 0;
  let rateLimited = false;
  let rateLimitResetAt: number | undefined;
  let completed = 0;

  for (let i = 0; i < docsToLink.length; i += batchSize) {
    const batch = docsToLink.slice(i, i + batchSize);

    const batchResult = await processDocumentBatch(
      batch,
      docAdapter,
      api!,
      providerName,
      project!,
      direction!,
      progressLines
    );

    totalSucceeded += batchResult.succeeded;
    totalFailed += batchResult.failed;
    completed += batch.length;
    progress.update(completed);

    if (batchResult.rateLimited) {
      rateLimited = true;
      rateLimitResetAt = batchResult.resetAt;
      break;
    }

    if (i + batchSize < docsToLink.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  progress.finish();

  const skipped = docsToLink.length - totalSucceeded - totalFailed;

  const result: Record<string, unknown> = {
    provider: providerName,
    project,
    type: 'document',
    linked: totalSucceeded,
    failed: totalFailed,
    skipped,
    total: docsToLink.length,
    rateLimited,
    rateLimitResetAt: rateLimitResetAt ? new Date(rateLimitResetAt * 1000).toISOString() : undefined,
  };
  if (force && relinkCount > 0) {
    result.force = true;
    result.relinkCount = relinkCount;
    result.relinkFromProvider = relinkedFromProvider;
  }
  if (noLibrarySkipped > 0) {
    result.noLibrarySkipped = noLibrarySkipped;
  }

  if (mode === 'json') {
    return success(result);
  }

  if (mode === 'quiet') {
    return success(String(totalSucceeded));
  }

  const lines: string[] = [...progressLines, ''];
  const summaryParts = [t('externalSync.linkAll.linkedDocsSummary', { count: totalSucceeded, provider: providerName })];
  if (totalFailed > 0) {
    summaryParts.push(t('externalSync.linkAll.failedCount', { count: totalFailed }));
  }
  if (skipped > 0) {
    summaryParts.push(t('externalSync.linkAll.skippedCount', { count: skipped }));
  }
  lines.push(summaryParts.join(' '));

  if (noLibrarySkipped > 0) {
    lines.push(t('externalSync.linkAll.skippedNoLibrary', { count: noLibrarySkipped }));
  }

  if (rateLimited) {
    lines.push('');
    if (rateLimitResetAt) {
      const resetDate = new Date(rateLimitResetAt * 1000);
      lines.push(t('externalSync.rateLimitReached', { date: resetDate.toISOString() }));
    } else {
      lines.push(t('externalSync.rateLimitReachedNoReset'));
    }
  }

  return success(result, lines.join('\n'));
}

async function linkAllHandler(
  _args: string[],
  options: GlobalOptions & LinkAllOptions
): Promise<CommandResult> {
  const providerName = options.provider;
  if (!providerName) {
    return failure(
      t('externalSync.providerFlagRequired'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const elementType = options.type ?? 'task';
  if (elementType !== 'task' && elementType !== 'document') {
    return failure(
      t('externalSync.invalidTypeValueShort', { value: elementType }),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  // Document linking branch
  if (elementType === 'document') {
    return linkAllDocumentsHandler(options);
  }

  const isDryRun = options['dry-run'] ?? false;
  const force = options.force ?? false;
  const batchSize = parseInt(options['batch-size'] ?? '10', 10);
  if (isNaN(batchSize) || batchSize < 1) {
    return failure(t('externalSync.batchSizePositive'), ExitCode.INVALID_ARGUMENTS);
  }

  // Parse status filters
  const statusFilters: string[] = [];
  if (options.status) {
    if (Array.isArray(options.status)) {
      statusFilters.push(...options.status);
    } else {
      statusFilters.push(options.status);
    }
  }

  // Get API for querying/updating tasks
  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  // Query all tasks
  let allTasks: Task[];
  try {
    const results = await api!.list({ type: 'task' });
    allTasks = results as Task[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('externalSync.failedToListTasks', { message }), ExitCode.GENERAL_ERROR);
  }

  // Filter tasks: unlinked tasks, plus (with --force) tasks linked to any provider
  let relinkedFromProvider: string | undefined;
  let relinkCount = 0;
  let tasksToLink = allTasks.filter((task) => {
    const metadata = (task.metadata ?? {}) as Record<string, unknown>;
    const syncState = metadata._externalSync as ExternalSyncState | undefined;

    if (!syncState) {
      // Unlinked task — always include
      return true;
    }

    if (force) {
      // Force mode: re-link regardless of current provider
      if (syncState.provider !== providerName) {
        relinkedFromProvider = syncState.provider;
      }
      relinkCount++;
      return true;
    }

    // Already linked (force not set) — skip
    return false;
  });

  // Apply status filter if specified
  if (statusFilters.length > 0) {
    tasksToLink = tasksToLink.filter((task) => statusFilters.includes(task.status));
  }

  // Skip tombstone tasks by default (soft-deleted)
  tasksToLink = tasksToLink.filter((task) => task.status !== 'tombstone');

  const mode = getOutputMode(options);

  if (tasksToLink.length === 0) {
    const result = { linked: 0, failed: 0, skipped: 0, total: 0, dryRun: isDryRun };
    if (mode === 'json') {
      return success(result);
    }
    const hint = force
      ? t('externalSync.linkAll.noTasksToRelink')
      : t('externalSync.linkAll.noUnlinkedTasks');
    return success(result, hint);
  }

  // Dry run — just list tasks that would be linked
  if (isDryRun) {
    const taskList = tasksToLink.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
    }));

    const jsonResult: Record<string, unknown> = {
      dryRun: true,
      provider: providerName,
      total: tasksToLink.length,
      tasks: taskList,
    };
    if (force && relinkCount > 0) {
      jsonResult.force = true;
      jsonResult.relinkCount = relinkCount;
      jsonResult.relinkFromProvider = relinkedFromProvider;
    }

    if (mode === 'json') {
      return success(jsonResult);
    }

    if (mode === 'quiet') {
      return success(String(tasksToLink.length));
    }

    const lines: string[] = [];
    if (force && relinkCount > 0) {
      lines.push(
        t('externalSync.linkAll.dryRunRelinkTasks', { count: relinkCount, from: relinkedFromProvider, to: providerName })
      );
      const newCount = tasksToLink.length - relinkCount;
      if (newCount > 0) {
        lines.push(t('externalSync.linkAll.dryRunPlusTasks', { count: newCount }));
      }
    } else {
      lines.push(t('externalSync.linkAll.dryRunTasks', { count: tasksToLink.length, provider: providerName }));
    }
    lines.push('');

    for (const task of tasksToLink) {
      lines.push(`  ${task.id}  ${task.status.padEnd(12)} ${task.title}`);
    }

    return success(jsonResult, lines.join('\n'));
  }

  // Warn about large element sets (skip for json/quiet — already handled above)
  if (tasksToLink.length > LARGE_SET_WARNING_THRESHOLD && mode !== 'json' && mode !== 'quiet') {
    process.stderr.write(
      `\n${t('externalSync.largeSetWarningTasks', { count: tasksToLink.length })}\n\n`
    );
  }

  // Create provider for actual linking (supports DI for testing)
  const providerFactory = options._providerFactory ?? createProviderFromSettings;
  const {
    provider: externalProvider,
    project,
    direction,
    error: providerError,
  } = await providerFactory(providerName, options.project, options);

  if (providerError) {
    return failure(providerError, ExitCode.GENERAL_ERROR);
  }

  // Get the task adapter
  const adapter = externalProvider!.getTaskAdapter?.();
  if (!adapter) {
    return failure(
      t('externalSync.providerNoTaskSync', { provider: providerName }),
      ExitCode.GENERAL_ERROR
    );
  }

  const progressLines: string[] = [];

  // Log re-linking info when using --force
  if (force && relinkCount > 0 && mode !== 'json' && mode !== 'quiet') {
    progressLines.push(
      t('externalSync.linkAll.relinkingTasks', { count: relinkCount, from: relinkedFromProvider, to: providerName })
    );
    const newCount = tasksToLink.length - relinkCount;
    if (newCount > 0) {
      progressLines.push(t('externalSync.linkAll.linkingTasks', { count: newCount }));
    }
    progressLines.push('');
  }

  // Progress bar — only in default/verbose human-readable output mode
  const progress = mode === 'json' || mode === 'quiet'
    ? nullProgressBar
    : createProgressBar(tasksToLink.length, t('externalSync.linkAll.linkingTasksProgress'));

  // Process tasks in batches
  let totalSucceeded = 0;
  let totalFailed = 0;
  let rateLimited = false;
  let rateLimitResetAt: number | undefined;
  let completed = 0;

  for (let i = 0; i < tasksToLink.length; i += batchSize) {
    const batch = tasksToLink.slice(i, i + batchSize);

    const batchResult = await processBatch(
      batch,
      adapter,
      api!,
      providerName,
      project!,
      direction!,
      progressLines
    );

    totalSucceeded += batchResult.succeeded;
    totalFailed += batchResult.failed;
    completed += batch.length;
    progress.update(completed);

    if (batchResult.rateLimited) {
      rateLimited = true;
      rateLimitResetAt = batchResult.resetAt;
      break;
    }

    // Small delay between batches to be gentle on the API
    if (i + batchSize < tasksToLink.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  progress.finish();

  const skipped = tasksToLink.length - totalSucceeded - totalFailed;

  // Build result
  const result: Record<string, unknown> = {
    provider: providerName,
    project,
    linked: totalSucceeded,
    failed: totalFailed,
    skipped,
    total: tasksToLink.length,
    rateLimited,
    rateLimitResetAt: rateLimitResetAt ? new Date(rateLimitResetAt * 1000).toISOString() : undefined,
  };
  if (force && relinkCount > 0) {
    result.force = true;
    result.relinkCount = relinkCount;
    result.relinkFromProvider = relinkedFromProvider;
  }

  if (mode === 'json') {
    return success(result);
  }

  if (mode === 'quiet') {
    return success(String(totalSucceeded));
  }

  // Human-readable output
  const lines: string[] = [...progressLines, ''];

  // Summary
  const summaryParts = [t('externalSync.linkAll.linkedTasksSummary', { count: totalSucceeded, provider: providerName })];
  if (totalFailed > 0) {
    summaryParts.push(t('externalSync.linkAll.failedCount', { count: totalFailed }));
  }
  if (skipped > 0) {
    summaryParts.push(t('externalSync.linkAll.skippedCount', { count: skipped }));
  }
  lines.push(summaryParts.join(' '));

  if (rateLimited) {
    lines.push('');
    if (rateLimitResetAt) {
      const resetDate = new Date(rateLimitResetAt * 1000);
      lines.push(t('externalSync.rateLimitReached', { date: resetDate.toISOString() }));
    } else {
      lines.push(t('externalSync.rateLimitReachedNoReset'));
    }
  }

  return success(result, lines.join('\n'));
}

// ============================================================================
// Config Parent Command (for subcommand structure)
// ============================================================================

const configSetTokenCommand: Command = {
  name: 'set-token',
  description: t('externalSync.config.setToken.description'),
  usage: 'sf external-sync config set-token <provider> <token>',
  help: t('externalSync.config.setToken.help'),
  options: [],
  handler: configSetTokenHandler as Command['handler'],
};

const configSetProjectCommand: Command = {
  name: 'set-project',
  description: t('externalSync.config.setProject.description'),
  usage: 'sf external-sync config set-project <provider> <project>',
  help: t('externalSync.config.setProject.help'),
  options: [],
  handler: configSetProjectHandler as Command['handler'],
};

const autoLinkTypeOption: CommandOption = {
  name: 'type',
  short: 't',
  description: t('externalSync.config.autoLinkTypeOption'),
  hasValue: true,
};

const configSetAutoLinkCommand: Command = {
  name: 'set-auto-link',
  description: t('externalSync.config.setAutoLink.description'),
  usage: 'sf external-sync config set-auto-link <provider> [--type task|document]',
  help: t('externalSync.config.setAutoLink.help'),
  options: [autoLinkTypeOption],
  handler: configSetAutoLinkHandler as Command['handler'],
};

const disableAutoLinkTypeOption: CommandOption = {
  name: 'type',
  short: 't',
  description: t('externalSync.config.disableAutoLinkTypeOption'),
  hasValue: true,
};

const configDisableAutoLinkCommand: Command = {
  name: 'disable-auto-link',
  description: t('externalSync.config.disableAutoLink.description'),
  usage: 'sf external-sync config disable-auto-link [--type task|document|all]',
  help: t('externalSync.config.disableAutoLink.help'),
  options: [disableAutoLinkTypeOption],
  handler: configDisableAutoLinkHandler as Command['handler'],
};

const configParentCommand: Command = {
  name: 'config',
  description: t('externalSync.config.description'),
  usage: 'sf external-sync config [set-token|set-project|set-auto-link|disable-auto-link]',
  help: t('externalSync.config.help'),
  subcommands: {
    'set-token': configSetTokenCommand,
    'set-project': configSetProjectCommand,
    'set-auto-link': configSetAutoLinkCommand,
    'disable-auto-link': configDisableAutoLinkCommand,
  },
  options: [],
  handler: configHandler as Command['handler'],
};

// ============================================================================
// Link Parent Command
// ============================================================================

const linkCommand: Command = {
  name: 'link',
  description: t('externalSync.link.description'),
  usage: 'sf external-sync link <elementId> <url-or-external-id> [--type task|document] [--provider <name>]',
  help: t('externalSync.link.help'),
  options: linkOptions,
  handler: linkHandler as Command['handler'],
};

// ============================================================================
// Link-All Command
// ============================================================================

const linkAllCommand: Command = {
  name: 'link-all',
  description: t('externalSync.linkAll.description'),
  usage: 'sf external-sync link-all --provider <provider> [--type task|document] [--project <project>] [--status <status>] [--dry-run] [--batch-size <n>] [--force] [--no-library]',
  help: t('externalSync.linkAll.help'),
  options: linkAllOptions,
  handler: linkAllHandler as Command['handler'],
};

// ============================================================================
// Unlink Command
// ============================================================================

const unlinkCommand: Command = {
  name: 'unlink',
  description: t('externalSync.unlink.description'),
  usage: 'sf external-sync unlink <elementId>',
  help: t('externalSync.unlink.help'),
  options: [],
  handler: unlinkHandler as Command['handler'],
};

// ============================================================================
// Unlink-All Command
// ============================================================================

const unlinkAllCommand: Command = {
  name: 'unlink-all',
  description: t('externalSync.unlinkAll.description'),
  usage: 'sf external-sync unlink-all [--provider <name>] [--type task|document|all] [--dry-run]',
  help: t('externalSync.unlinkAll.help'),
  options: unlinkAllOptions,
  handler: unlinkAllHandler as Command['handler'],
};

// ============================================================================
// Push Command
// ============================================================================


const pushCommand: Command = {
  name: 'push',
  description: t('externalSync.push.description'),
  usage: 'sf external-sync push [elementId...] [--all] [--force] [--type task|document|all] [--no-library]',
  help: t('externalSync.push.help'),
  options: pushOptions,
  handler: pushHandler as Command['handler'],
};

// ============================================================================
// Pull Command
// ============================================================================

const pullCommand: Command = {
  name: 'pull',
  description: t('externalSync.pull.description'),
  usage: 'sf external-sync pull [--provider <name>] [--discover] [--type task|document|all]',
  help: t('externalSync.pull.help'),
  options: pullOptions,
  handler: pullHandler as Command['handler'],
};

// ============================================================================
// Sync Command
// ============================================================================

const biSyncCommand: Command = {
  name: 'sync',
  description: t('externalSync.sync.description'),
  usage: 'sf external-sync sync [--dry-run] [--type task|document|all]',
  help: t('externalSync.sync.help'),
  options: syncOptions,
  handler: syncHandler as Command['handler'],
};

// ============================================================================
// Status Command
// ============================================================================

const extStatusCommand: Command = {
  name: 'status',
  description: t('externalSync.status.description'),
  usage: 'sf external-sync status',
  help: t('externalSync.status.help'),
  options: [],
  handler: statusHandler as Command['handler'],
};

// ============================================================================
// Resolve Command
// ============================================================================

const resolveCommand: Command = {
  name: 'resolve',
  description: t('externalSync.resolve.description'),
  usage: 'sf external-sync resolve <elementId> --keep local|remote',
  help: t('externalSync.resolve.help'),
  options: resolveOptions,
  handler: resolveHandler as Command['handler'],
};

// ============================================================================
// External Sync Parent Command
// ============================================================================

export const externalSyncCommand: Command = {
  name: 'external-sync',
  description: t('externalSync.description'),
  usage: 'sf external-sync <command> [options]',
  help: t('externalSync.help'),
  subcommands: {
    config: configParentCommand,
    link: linkCommand,
    'link-all': linkAllCommand,
    unlink: unlinkCommand,
    'unlink-all': unlinkAllCommand,
    push: pushCommand,
    pull: pullCommand,
    sync: biSyncCommand,
    status: extStatusCommand,
    resolve: resolveCommand,
  },
  handler: async (_args, options) => {
    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({
        commands: ['config', 'link', 'link-all', 'unlink', 'unlink-all', 'push', 'pull', 'sync', 'status', 'resolve'],
      });
    }
    return failure(
      t('externalSync.parentUsage'),
      ExitCode.INVALID_ARGUMENTS
    );
  },
};
