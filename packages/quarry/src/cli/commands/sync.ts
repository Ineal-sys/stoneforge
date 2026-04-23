/**
 * Sync Commands - Export, Import, and Status operations
 *
 * Provides CLI commands for JSONL sync operations:
 * - export: Export elements to JSONL files
 * - import: Import elements from JSONL files
 * - status: Show sync status (dirty elements, etc.)
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createSyncService } from '../../sync/service.js';
import type { ExportResult, ImportResult } from '../../sync/types.js';
import { resolveDatabasePath, STONEFORGE_DIR, DEFAULT_DB_NAME } from '../db.js';
import { t } from '../i18n/index.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SYNC_DIR = 'sync';

// ============================================================================
// Database Helper
// ============================================================================

/**
 * Creates a SyncService instance from options
 */
function createSyncServiceFromOptions(options: GlobalOptions): {
  syncService: ReturnType<typeof createSyncService>;
  error?: string;
} {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return {
      syncService: null as unknown as ReturnType<typeof createSyncService>,
      error: t('sync.error.noDatabase'),
    };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    return { syncService: createSyncService(backend) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      syncService: null as unknown as ReturnType<typeof createSyncService>,
      error: t('sync.error.openFailed', { message }),
    };
  }
}

/**
 * Resolves sync directory from options or default
 */
function resolveSyncDir(options: { output?: string; input?: string }, isExport: boolean): string {
  const pathOption = isExport ? options.output : options.input;
  if (pathOption) {
    return resolve(pathOption);
  }

  // Default to .stoneforge/sync
  const stoneforgeDir = join(process.cwd(), STONEFORGE_DIR);
  return join(stoneforgeDir, DEFAULT_SYNC_DIR);
}

// ============================================================================
// Export Command
// ============================================================================

interface ExportOptions {
  output?: string;
  full?: boolean;
  'include-ephemeral'?: boolean;
}

const exportOptions: CommandOption[] = [
  {
    name: 'output',
    short: 'o',
    description: t('sync.export.option.output'),
    hasValue: true,
  },
  {
    name: 'full',
    short: 'f',
    description: t('sync.export.option.full'),
  },
  {
    name: 'include-ephemeral',
    description: t('sync.export.option.includeEphemeral'),
  },
];

async function exportHandler(
  _args: string[],
  options: GlobalOptions & ExportOptions
): Promise<CommandResult> {
  const { syncService, error } = createSyncServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const outputDir = resolveSyncDir(options, true);

    const result: ExportResult = syncService.exportSync({
      outputDir,
      full: options.full ?? false,
      includeEphemeral: options['include-ephemeral'] ?? false,
    });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(result);
    }

    if (mode === 'quiet') {
      return success(`${result.elementsExported}:${result.dependenciesExported}`);
    }

    // Human-readable output
    const exportType = result.incremental ? t('sync.export.label.incremental') : t('sync.export.label.full');
    const lines = [
      t('sync.export.success.completed', { type: exportType }),
      '',
      `${t('sync.export.label.elementsExported')}:     ${result.elementsExported}`,
      `${t('sync.export.label.dependenciesExported')}: ${result.dependenciesExported}`,
      '',
      `${t('sync.export.label.files')}:`,
      `  ${result.elementsFile}`,
      `  ${result.dependenciesFile}`,
    ];

    return success(result, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('sync.export.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const exportCommand: Command = {
  name: 'export',
  description: t('sync.export.description'),
  usage: 'sf export [options]',
  help: t('sync.export.help'),
  options: exportOptions,
  handler: exportHandler as Command['handler'],
};

// ============================================================================
// Import Command
// ============================================================================

interface ImportOptions {
  input?: string;
  'dry-run'?: boolean;
  force?: boolean;
}

const importOptions: CommandOption[] = [
  {
    name: 'input',
    short: 'i',
    description: t('sync.import.option.input'),
    hasValue: true,
  },
  {
    name: 'dry-run',
    short: 'n',
    description: t('sync.import.option.dryRun'),
  },
  {
    name: 'force',
    short: 'f',
    description: t('sync.import.option.force'),
  },
];

async function importHandler(
  _args: string[],
  options: GlobalOptions & ImportOptions
): Promise<CommandResult> {
  const { syncService, error } = createSyncServiceFromOptions(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const inputDir = resolveSyncDir(options, false);

    // Check if input directory exists
    if (!existsSync(inputDir)) {
      return failure(t('sync.import.error.inputNotFound', { dir: inputDir }), ExitCode.NOT_FOUND);
    }

    const result: ImportResult = syncService.importSync({
      inputDir,
      dryRun: options['dry-run'] ?? false,
      force: options.force ?? false,
    });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(result);
    }

    if (mode === 'quiet') {
      return success(`${result.elementsImported}:${result.dependenciesImported}`);
    }

    // Human-readable output
    const isDryRun = options['dry-run'] ?? false;
    const actionWord = isDryRun ? t('sync.import.label.wouldImport') : t('sync.import.label.imported');

    const lines: string[] = [
      isDryRun ? t('sync.import.label.dryRun') : t('sync.import.label.completed'),
      '',
      `${t('sync.export.label.elementsExported')}:`,
      `  ${actionWord}: ${result.elementsImported}`,
      `  ${t('sync.import.label.skipped')}:  ${result.elementsSkipped}`,
      '',
      `${t('sync.export.label.dependenciesExported')}:`,
      `  ${actionWord}: ${result.dependenciesImported}`,
      `  ${t('sync.import.label.skipped')}:  ${result.dependenciesSkipped}`,
    ];

    // Show conflicts if any
    if (result.conflicts.length > 0) {
      lines.push('');
      lines.push(t('sync.import.label.conflictsResolved', { count: result.conflicts.length }));
      for (const conflict of result.conflicts.slice(0, 5)) {
        lines.push(`  ${conflict.elementId}: ${conflict.resolution}`);
      }
      if (result.conflicts.length > 5) {
        lines.push(t('sync.import.label.andMore', { count: result.conflicts.length - 5 }));
      }
    }

    // Show errors if any
    if (result.errors.length > 0) {
      lines.push('');
      lines.push(t('sync.import.label.errors', { count: result.errors.length }));
      for (const err of result.errors.slice(0, 5)) {
        lines.push(`  ${err.file}:${err.line}: ${err.message}`);
      }
      if (result.errors.length > 5) {
        lines.push(t('sync.import.label.andMore', { count: result.errors.length - 5 }));
      }
    }

    return success(result, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('sync.import.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const importCommand: Command = {
  name: 'import',
  description: t('sync.import.description'),
  usage: 'sf import [options]',
  help: t('sync.import.help'),
  options: importOptions,
  handler: importHandler as Command['handler'],
};

// ============================================================================
// Status Command
// ============================================================================

async function statusHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return failure(
      t('sync.error.noDatabase'),
      ExitCode.GENERAL_ERROR
    );
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);

    // Get dirty element count
    const dirtyElements = backend.getDirtyElements();
    const dirtyCount = dirtyElements.length;

    // Get total element count
    const totalResult = backend.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM elements WHERE deleted_at IS NULL'
    );
    const totalCount = totalResult?.count ?? 0;

    // Check sync directory
    const syncDir = join(process.cwd(), STONEFORGE_DIR, DEFAULT_SYNC_DIR);
    const syncDirExists = existsSync(syncDir);
    const elementsFileExists = syncDirExists && existsSync(join(syncDir, 'elements.jsonl'));
    const dependenciesFileExists = syncDirExists && existsSync(join(syncDir, 'dependencies.jsonl'));

    // Build status object
    const status = {
      dirtyElementCount: dirtyCount,
      totalElementCount: totalCount,
      hasPendingChanges: dirtyCount > 0,
      syncDirectory: syncDir,
      syncDirectoryExists: syncDirExists,
      elementsFileExists,
      dependenciesFileExists,
    };

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(status);
    }

    if (mode === 'quiet') {
      return success(String(dirtyCount));
    }

    // Human-readable output
    const lines: string[] = [
      t('sync.status.label.title'),
      '',
      `${t('stats.label.total')} ${t('sync.status.label.elements')}:   ${totalCount}`,
      `${t('sync.status.label.pendingChanges')}:  ${dirtyCount}`,
      '',
      `${t('sync.status.label.syncDir')}:   ${syncDir}`,
      `  ${t('sync.status.label.directory')}:      ${syncDirExists ? t('label.exists') : t('label.notFound')}`,
      `  elements.jsonl: ${elementsFileExists ? t('label.exists') : t('label.notFound')}`,
      `  dependencies.jsonl: ${dependenciesFileExists ? t('label.exists') : t('label.notFound')}`,
    ];

    if (dirtyCount > 0) {
      lines.push('');
      lines.push(t('sync.status.label.runExport'));
    }

    return success(status, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('sync.status.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const statusCommand: Command = {
  name: 'status',
  description: t('sync.status.description'),
  usage: 'sf status',
  help: t('sync.status.help'),
  options: [],
  handler: statusHandler as Command['handler'],
};

// ============================================================================
// Sync Parent Command (for subcommand structure)
// ============================================================================

export const syncCommand: Command = {
  name: 'sync',
  description: t('sync.description'),
  usage: 'sf sync <command> [options]',
  help: t('sync.help'),
  subcommands: {
    export: exportCommand,
    import: importCommand,
    status: statusCommand,
  },
  handler: async (_args, options) => {
    // Show help if no subcommand specified
    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({
        commands: ['export', 'import', 'status'],
      });
    }
    return failure(t('sync.error.usage'), ExitCode.INVALID_ARGUMENTS);
  },
};
