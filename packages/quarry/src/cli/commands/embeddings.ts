/**
 * Embeddings Commands - Manage document embeddings for semantic search
 *
 * Provides CLI commands for embedding operations:
 * - embeddings install: Download the local embedding model
 * - embeddings status: Show embedding configuration and model availability
 * - embeddings reindex: Re-embed all documents
 * - embeddings search: Semantic search (for testing)
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';
import { getOutputMode } from '../formatter.js';
import { DocumentStatus, type Document, type ElementId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { EmbeddingService } from '../../services/embeddings/service.js';
import { LocalEmbeddingProvider } from '../../services/embeddings/local-provider.js';
import { suggestCommands } from '../suggest.js';
import { createAPI, STONEFORGE_DIR } from '../db.js';

// ============================================================================
// Constants
// ============================================================================

const MODELS_DIR = 'models';
const DEFAULT_MODEL = 'bge-base-en-v1.5';

// ============================================================================
// Helpers
// ============================================================================

function createEmbeddingService(options: GlobalOptions): { service: EmbeddingService; error?: string } {
  const { backend, error } = createAPI(options);
  if (error) {
    return {
      service: null as unknown as EmbeddingService,
      error,
    };
  }

  try {
    const provider = new LocalEmbeddingProvider();
    return { service: new EmbeddingService(backend, { provider }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      service: null as unknown as EmbeddingService,
      error: t('embeddings.error.initFailed', { message }),
    };
  }
}

// ============================================================================
// Embeddings Install Command
// ============================================================================

async function embeddingsInstallHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const modelDir = join(process.cwd(), STONEFORGE_DIR, MODELS_DIR, DEFAULT_MODEL);

  if (existsSync(modelDir)) {
    return success(null, t('embeddings.install.alreadyInstalled', { model: DEFAULT_MODEL, path: modelDir }));
  }

  try {
    // Create model directory (placeholder for actual model download)
    mkdirSync(modelDir, { recursive: true });

    // TODO: Download actual ONNX model files
    // For now, just create the directory to mark as "installed"

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ model: DEFAULT_MODEL, path: modelDir, status: 'installed' });
    }

    return success(
      null,
      t('embeddings.install.success', { model: DEFAULT_MODEL, path: modelDir })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('embeddings.error.failedToInstall', { message }), ExitCode.GENERAL_ERROR);
  }
}

const embeddingsInstallCommand: Command = {
  name: 'install',
  description: t('embeddings.install.description'),
  usage: 'sf embeddings install',
  help: t('embeddings.install.help'),
  handler: embeddingsInstallHandler as Command['handler'],
};

// ============================================================================
// Embeddings Status Command
// ============================================================================

async function embeddingsStatusHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const modelDir = join(process.cwd(), STONEFORGE_DIR, MODELS_DIR, DEFAULT_MODEL);
  const modelInstalled = existsSync(modelDir);

  const { service, error } = createEmbeddingService(options);

  const status = {
    model: DEFAULT_MODEL,
    modelInstalled,
    modelPath: modelDir,
    provider: service ? service.getProviderInfo() : null,
    available: service ? await service.isAvailable() : false,
    error: error ?? null,
  };

  const mode = getOutputMode(options);
  if (mode === 'json') {
    return success(status);
  }

  const lines = [
    t('embeddings.status.model', { model: status.model }),
    t('embeddings.status.installed', { status: status.modelInstalled ? t('label.yes') : t('label.no') }),
    t('embeddings.status.path', { path: status.modelPath }),
    t('embeddings.status.available', { status: status.available ? t('label.yes') : t('label.no') }),
  ];

  if (status.provider) {
    lines.push(t('embeddings.status.provider', { name: status.provider.name, dimensions: status.provider.dimensions, mode: status.provider.isLocal ? t('embeddings.status.local') : t('embeddings.status.remote') }));
  }

  if (status.error) {
    lines.push(t('embeddings.status.error', { error: status.error }));
  }

  if (!status.modelInstalled) {
    lines.push(t('embeddings.status.installPrompt'));
  }

  return success(status, lines.join('\n'));
}

const embeddingsStatusCommand: Command = {
  name: 'status',
  description: t('embeddings.status.description'),
  usage: 'sf embeddings status',
  help: t('embeddings.status.help'),
  handler: embeddingsStatusHandler as Command['handler'],
};

// ============================================================================
// Embeddings Reindex Command
// ============================================================================

async function embeddingsReindexHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { service, error: serviceError } = createEmbeddingService(options);
  if (serviceError) {
    return failure(serviceError, ExitCode.GENERAL_ERROR);
  }

  const available = await service.isAvailable();
  if (!available) {
    return failure(
      `Embedding model not installed. Run 'sf embeddings install' first.`,
      ExitCode.GENERAL_ERROR
    );
  }

  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get all documents (including archived)
    const result = await api.listPaginated<Document>({
      type: 'document',
      limit: 10000,
      status: [DocumentStatus.ACTIVE, DocumentStatus.ARCHIVED],
    } as Record<string, unknown>);

    const documents = result.items.map((doc) => ({
      id: doc.id,
      content: `${doc.title ?? ''} ${doc.content}`.trim(),
    }));

    const { indexed, errors } = await service.reindexAll(documents);

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ indexed, errors, total: documents.length });
    }

    return success(
      null,
      t('embeddings.reindex.success', { indexed, errors })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('embeddings.error.failedToReindex', { message }), ExitCode.GENERAL_ERROR);
  }
}

const embeddingsReindexCommand: Command = {
  name: 'reindex',
  description: t('embeddings.reindex.description'),
  usage: 'sf embeddings reindex',
  help: t('embeddings.reindex.help'),
  handler: embeddingsReindexHandler as Command['handler'],
};

// ============================================================================
// Embeddings Search Command
// ============================================================================

async function embeddingsSearchHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const query = args.join(' ');

  if (!query.trim()) {
    return failure(t('embeddings.search.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { service, error: serviceError } = createEmbeddingService(options);
  if (serviceError) {
    return failure(serviceError, ExitCode.GENERAL_ERROR);
  }

  const available = await service.isAvailable();
  if (!available) {
    return failure(
      `Embedding model not installed. Run 'sf embeddings install' first.`,
      ExitCode.GENERAL_ERROR
    );
  }

  try {
    const results = await service.searchSemantic(query.trim(), 10);

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success(results);
    }

    if (results.length === 0) {
      return success(null, t('embeddings.search.noResults'));
    }

    const lines = results.map((r, i) =>
      `${i + 1}. ${r.documentId} (similarity: ${r.similarity.toFixed(4)})`
    );

    return success(results, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('embeddings.error.failedToSearch', { message }), ExitCode.GENERAL_ERROR);
  }
}

const embeddingsSearchCommand: Command = {
  name: 'search',
  description: t('embeddings.search.description'),
  usage: 'sf embeddings search <query>',
  help: t('embeddings.search.help'),
  handler: embeddingsSearchHandler as Command['handler'],
};

// ============================================================================
// Embeddings Root Command
// ============================================================================

export const embeddingsCommand: Command = {
  name: 'embeddings',
  description: t('embeddings.description'),
  usage: 'sf embeddings <subcommand>',
  help: t('embeddings.help'),
  subcommands: {
    install: embeddingsInstallCommand,
    status: embeddingsStatusCommand,
    reindex: embeddingsReindexCommand,
    search: embeddingsSearchCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    find: embeddingsSearchCommand,
  },
  handler: async (args, _options): Promise<CommandResult> => {
    if (args.length === 0) {
      return failure(
        t('embeddings.usage'),
        ExitCode.INVALID_ARGUMENTS
      );
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(embeddingsCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = t('error.unknownSubcommand', { subcommand: args[0] });
    if (suggestions.length > 0) {
      msg += '\n' + suggestions.map(s => `  ${s}`).join('\n');
    }
    msg += '\n\n' + t('error.runHelp', { command: 'sf embeddings' });
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
