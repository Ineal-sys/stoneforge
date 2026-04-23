/**
 * Pool Commands - CLI operations for agent pool management
 *
 * Provides commands for managing agent pools:
 * - pool list: List all agent pools
 * - pool show <id>: Show pool details
 * - pool create <name>: Create a new agent pool
 * - pool update <id>: Update pool configuration
 * - pool delete <id>: Delete a pool
 * - pool status <id>: Show pool status with active agents
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getFormatter, getOutputMode, OPERATOR_ENTITY_ID } from '@stoneforge/quarry/cli';
import type { EntityId, ElementId } from '@stoneforge/core';
import type { AgentPool, CreatePoolInput, UpdatePoolInput, PoolAgentTypeConfig, AgentRole, WorkerMode, StewardFocus } from '../../types/index.js';
import { t } from '../i18n/index.js';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates orchestrator API client and pool service
 */
async function createPoolClient(options: GlobalOptions): Promise<{
  poolService: import('../../services/index.js').AgentPoolService | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createOrchestratorAPI } = await import('../../api/index.js');
    const { createAgentPoolService, createAgentRegistry } = await import('../../services/index.js');
    const { createSpawnerService, createSessionManager } = await import('../../runtime/index.js');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return {
        poolService: null,
        error: t('pool.noStoneforge'),
      };
    }

    const dbPath = options.db ?? `${stoneforgeDir}/stoneforge.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createOrchestratorAPI(backend);

    // Create agent registry
    const agentRegistry = createAgentRegistry(api);

    // Create spawner and session manager
    const spawner = createSpawnerService();
    const sessionManager = createSessionManager(spawner, api, agentRegistry);

    // Create pool service
    const poolService = createAgentPoolService(api, sessionManager, agentRegistry);

    return { poolService };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { poolService: null, error: t('pool.serviceInitFailed', { message }) };
  }
}

/**
 * Parses agent type configuration from CLI string format
 * Format: "role[:workerMode|stewardFocus][:priority][:maxSlots][:provider][:model]"
 * Examples:
 *   "worker:ephemeral:100:5"                          - ephemeral workers, priority 100, max 5 slots
 *   "worker:ephemeral:100:5:claude-code:claude-sonnet-4-20250514" - with provider and model
 *   "worker:persistent:50"                            - persistent workers, priority 50
 *   "steward:merge"                                   - merge stewards
 *   "worker"                                          - all workers with default settings
 */
function parseAgentTypeConfig(configStr: string): PoolAgentTypeConfig | null {
  const parts = configStr.split(':');
  if (parts.length === 0) return null;

  const role = parts[0] as AgentRole;
  if (!['worker', 'steward'].includes(role)) {
    return null;
  }

  // Build config properties
  let workerMode: WorkerMode | undefined;
  let stewardFocus: StewardFocus | undefined;
  let priority: number | undefined;
  let maxSlots: number | undefined;
  let provider: string | undefined;
  let model: string | undefined;

  if (parts.length > 1) {
    if (role === 'worker') {
      if (['ephemeral', 'persistent'].includes(parts[1])) {
        workerMode = parts[1] as WorkerMode;
      } else if (!isNaN(parseInt(parts[1], 10))) {
        // It's a priority number
        priority = parseInt(parts[1], 10);
      }
    } else if (role === 'steward') {
      if (['merge', 'docs', 'recovery', 'custom'].includes(parts[1])) {
        stewardFocus = parts[1] as StewardFocus;
      } else if (!isNaN(parseInt(parts[1], 10))) {
        priority = parseInt(parts[1], 10);
      }
    }
  }

  if (parts.length > 2) {
    const maybeNum = parseInt(parts[2], 10);
    if (!isNaN(maybeNum)) {
      priority = maybeNum;
    }
  }

  if (parts.length > 3) {
    const maybeSlots = parseInt(parts[3], 10);
    if (!isNaN(maybeSlots)) {
      maxSlots = maybeSlots;
    }
  }

  if (parts.length > 4 && parts[4].trim()) {
    provider = parts[4];
  }

  if (parts.length > 5 && parts[5].trim()) {
    model = parts[5];
  }

  // Build the config object with all properties upfront
  const config: PoolAgentTypeConfig = {
    role: role as Exclude<AgentRole, 'director'>,
    ...(workerMode !== undefined && { workerMode }),
    ...(stewardFocus !== undefined && { stewardFocus }),
    ...(priority !== undefined && { priority }),
    ...(maxSlots !== undefined && { maxSlots }),
    ...(provider !== undefined && { provider }),
    ...(model !== undefined && { model }),
  };

  return config;
}

/**
 * Formats agent type config for display
 */
function formatAgentTypeConfig(config: PoolAgentTypeConfig): string {
  let result = config.role;
  if (config.workerMode) result += `:${config.workerMode}`;
  if (config.stewardFocus) result += `:${config.stewardFocus}`;
  if (config.priority !== undefined) result += ` (priority: ${config.priority})`;
  if (config.maxSlots !== undefined) result += ` (max: ${config.maxSlots})`;
  if (config.provider) result += ` [provider: ${config.provider}]`;
  if (config.model) result += ` [model: ${config.model}]`;
  return result;
}

// ============================================================================
// Pool List Command
// ============================================================================

interface PoolListOptions {
  enabled?: boolean;
  available?: boolean;
  tag?: string;
}

const poolListOptions: CommandOption[] = [
  {
    name: 'enabled',
    short: 'e',
    description: t('pool.list.option.enabled'),
  },
  {
    name: 'available',
    short: 'a',
    description: t('pool.list.option.available'),
  },
  {
    name: 'tag',
    short: 't',
    description: t('pool.list.option.tag'),
    hasValue: true,
  },
];

async function poolListHandler(
  _args: string[],
  options: GlobalOptions & PoolListOptions
): Promise<CommandResult> {
  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? t('shared.failedToCreatePoolService'), ExitCode.GENERAL_ERROR);
  }

  try {
    const pools = await poolService.listPools({
      enabled: options.enabled,
      hasAvailableSlots: options.available,
      tags: options.tag ? [options.tag] : undefined,
    });

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(pools);
    }

    if (mode === 'quiet') {
      return success(pools.map((p) => p.id).join('\n'));
    }

    if (pools.length === 0) {
      return success(null, t('pool.list.noPools'));
    }

    const headers = ['ID', 'NAME', 'SIZE', 'ACTIVE', 'AVAILABLE', 'ENABLED'];
    const rows = pools.map((pool) => [
      pool.id,
      pool.config.name,
      String(pool.config.maxSize),
      String(pool.status.activeCount),
      String(pool.status.availableSlots),
      pool.config.enabled ? 'yes' : 'no',
    ]);

    const table = formatter.table(headers, rows);
    return success(pools, `${table}\n${t('pool.list.poolCount', { count: pools.length })}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('pool.list.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const poolListCommand: Command = {
  name: 'list',
  description: t('pool.list.description'),
  usage: 'sf pool list [options]',
  help: t('pool.list.help'),
  options: poolListOptions,
  handler: poolListHandler as Command['handler'],
};

// ============================================================================
// Pool Show Command
// ============================================================================

async function poolShowHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [idOrName] = args;

  if (!idOrName) {
    return failure(t('pool.show.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? t('shared.failedToCreatePoolService'), ExitCode.GENERAL_ERROR);
  }

  try {
    // Try to get by ID first, then by name
    let pool: AgentPool | undefined;
    if (idOrName.startsWith('el-')) {
      pool = await poolService.getPool(idOrName as ElementId);
    }
    if (!pool) {
      pool = await poolService.getPoolByName(idOrName);
    }

    if (!pool) {
      return failure(t('pool.show.notFound', { idOrName }), ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(pool);
    }

    if (mode === 'quiet') {
      return success(pool.id);
    }

    const lines = [
      `ID:          ${pool.id}`,
      `Name:        ${pool.config.name}`,
      `Description: ${pool.config.description ?? '-'}`,
      `Max Size:    ${pool.config.maxSize}`,
      `Enabled:     ${pool.config.enabled ? 'yes' : 'no'}`,
      `Created:     ${pool.createdAt}`,
      '',
      'Status:',
      `  Active:    ${pool.status.activeCount}`,
      `  Available: ${pool.status.availableSlots}`,
      `  Updated:   ${pool.status.lastUpdatedAt}`,
    ];

    if (pool.config.agentTypes.length > 0) {
      lines.push('', 'Agent Types:');
      for (const typeConfig of pool.config.agentTypes) {
        lines.push(`  - ${formatAgentTypeConfig(typeConfig)}`);
      }
    }

    if (pool.config.tags && pool.config.tags.length > 0) {
      lines.push(`Tags:        ${pool.config.tags.join(', ')}`);
    }

    if (pool.status.activeAgentIds.length > 0) {
      lines.push('', 'Active Agents:');
      for (const agentId of pool.status.activeAgentIds) {
        lines.push(`  - ${agentId}`);
      }
    }

    return success(pool, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('pool.show.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const poolShowCommand: Command = {
  name: 'show',
  description: t('pool.show.description'),
  usage: 'sf pool show <id|name>',
  help: t('pool.show.help'),
  options: [],
  handler: poolShowHandler as Command['handler'],
};

// ============================================================================
// Pool Create Command
// ============================================================================

interface PoolCreateOptions {
  size?: string;
  description?: string;
  agentType?: string | string[];
  tags?: string;
  disabled?: boolean;
}

const poolCreateOptions: CommandOption[] = [
  {
    name: 'size',
    short: 's',
    description: t('pool.create.option.size'),
    hasValue: true,
  },
  {
    name: 'description',
    short: 'd',
    description: t('pool.create.option.description'),
    hasValue: true,
  },
  {
    name: 'agentType',
    short: 't',
    description: t('pool.create.option.agentType'),
    hasValue: true,
  },
  {
    name: 'tags',
    description: t('pool.create.option.tags'),
    hasValue: true,
  },
  {
    name: 'disabled',
    description: t('pool.create.option.disabled'),
  },
];

async function poolCreateHandler(
  args: string[],
  options: GlobalOptions & PoolCreateOptions
): Promise<CommandResult> {
  const [name] = args;

  if (!name) {
    return failure(t('pool.create.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? t('shared.failedToCreatePoolService'), ExitCode.GENERAL_ERROR);
  }

  try {
    const maxSize = options.size ? parseInt(options.size, 10) : 5;
    if (isNaN(maxSize) || maxSize < 1 || maxSize > 1000) {
      return failure(t('pool.create.invalidSize'), ExitCode.VALIDATION);
    }

    // Parse agent types
    const agentTypes: PoolAgentTypeConfig[] = [];
    const agentTypeInputs = Array.isArray(options.agentType)
      ? options.agentType
      : options.agentType
        ? [options.agentType]
        : [];

    for (const typeStr of agentTypeInputs) {
      const typeConfig = parseAgentTypeConfig(typeStr);
      if (!typeConfig) {
        return failure(
          t('pool.create.invalidAgentType', { typeStr }),
          ExitCode.VALIDATION
        );
      }
      agentTypes.push(typeConfig);
    }

    const input: CreatePoolInput = {
      name,
      description: options.description,
      maxSize,
      agentTypes,
      enabled: !options.disabled,
      tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : undefined,
      createdBy: (options.actor ?? OPERATOR_ENTITY_ID) as EntityId,
    };

    const pool = await poolService.createPool(input);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(pool);
    }

    if (mode === 'quiet') {
      return success(pool.id);
    }

    return success(pool, t('pool.create.success', { name, id: pool.id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('pool.create.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const poolCreateCommand: Command = {
  name: 'create',
  description: t('pool.create.description'),
  usage: 'sf pool create <name> [options]',
  help: t('pool.create.help'),
  options: poolCreateOptions,
  handler: poolCreateHandler as Command['handler'],
};

// ============================================================================
// Pool Update Command
// ============================================================================

interface PoolUpdateOptions {
  size?: string;
  description?: string;
  agentType?: string | string[];
  tags?: string;
  enable?: boolean;
  disable?: boolean;
}

const poolUpdateOptions: CommandOption[] = [
  {
    name: 'size',
    short: 's',
    description: t('pool.update.option.size'),
    hasValue: true,
  },
  {
    name: 'description',
    short: 'd',
    description: t('pool.update.option.description'),
    hasValue: true,
  },
  {
    name: 'agentType',
    short: 't',
    description: t('pool.update.option.agentType'),
    hasValue: true,
  },
  {
    name: 'tags',
    description: t('pool.update.option.tags'),
    hasValue: true,
  },
  {
    name: 'enable',
    description: t('pool.update.option.enable'),
  },
  {
    name: 'disable',
    description: t('pool.update.option.disable'),
  },
];

async function poolUpdateHandler(
  args: string[],
  options: GlobalOptions & PoolUpdateOptions
): Promise<CommandResult> {
  const [idOrName] = args;

  if (!idOrName) {
    return failure(t('pool.update.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  if (options.enable && options.disable) {
    return failure(t('pool.update.conflictEnableDisable'), ExitCode.VALIDATION);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? t('shared.failedToCreatePoolService'), ExitCode.GENERAL_ERROR);
  }

  try {
    // Find the pool
    let pool: AgentPool | undefined;
    if (idOrName.startsWith('el-')) {
      pool = await poolService.getPool(idOrName as ElementId);
    }
    if (!pool) {
      pool = await poolService.getPoolByName(idOrName);
    }

    if (!pool) {
      return failure(t('pool.update.notFound', { idOrName }), ExitCode.NOT_FOUND);
    }

    // Validate and parse options first
    let maxSize: number | undefined;
    if (options.size !== undefined) {
      maxSize = parseInt(options.size, 10);
      if (isNaN(maxSize) || maxSize < 1 || maxSize > 1000) {
        return failure(t('pool.update.invalidSize'), ExitCode.VALIDATION);
      }
    }

    let agentTypes: PoolAgentTypeConfig[] | undefined;
    if (options.agentType !== undefined) {
      agentTypes = [];
      const agentTypeInputs = Array.isArray(options.agentType)
        ? options.agentType
        : [options.agentType];

      for (const typeStr of agentTypeInputs) {
        const typeConfig = parseAgentTypeConfig(typeStr);
        if (!typeConfig) {
          return failure(
            t('pool.update.invalidAgentType', { typeStr }),
            ExitCode.VALIDATION
          );
        }
        agentTypes.push(typeConfig);
      }
    }

    const parsedTags = options.tags !== undefined
      ? options.tags.split(',').map((t) => t.trim())
      : undefined;

    const enabled = options.enable ? true : options.disable ? false : undefined;

    // Build updates object with all properties upfront
    const updates: UpdatePoolInput = {
      ...(options.description !== undefined && { description: options.description }),
      ...(maxSize !== undefined && { maxSize }),
      ...(agentTypes !== undefined && { agentTypes }),
      ...(parsedTags !== undefined && { tags: parsedTags }),
      ...(enabled !== undefined && { enabled }),
    };

    const updatedPool = await poolService.updatePool(pool.id, updates);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updatedPool);
    }

    if (mode === 'quiet') {
      return success(updatedPool.id);
    }

    return success(updatedPool, t('pool.update.success', { name: updatedPool.config.name }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('pool.update.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const poolUpdateCommand: Command = {
  name: 'update',
  description: t('pool.update.description'),
  usage: 'sf pool update <id|name> [options]',
  help: t('pool.update.help'),
  options: poolUpdateOptions,
  handler: poolUpdateHandler as Command['handler'],
};

// ============================================================================
// Pool Delete Command
// ============================================================================

interface PoolDeleteOptions {
  force?: boolean;
}

const poolDeleteOptions: CommandOption[] = [
  {
    name: 'force',
    short: 'f',
    description: t('pool.delete.option.force'),
  },
];

async function poolDeleteHandler(
  args: string[],
  options: GlobalOptions & PoolDeleteOptions
): Promise<CommandResult> {
  const [idOrName] = args;

  if (!idOrName) {
    return failure(t('pool.delete.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? t('shared.failedToCreatePoolService'), ExitCode.GENERAL_ERROR);
  }

  try {
    // Find the pool
    let pool: AgentPool | undefined;
    if (idOrName.startsWith('el-')) {
      pool = await poolService.getPool(idOrName as ElementId);
    }
    if (!pool) {
      pool = await poolService.getPoolByName(idOrName);
    }

    if (!pool) {
      return failure(t('pool.delete.notFound', { idOrName }), ExitCode.NOT_FOUND);
    }

    // Check for active agents
    if (pool.status.activeCount > 0 && !options.force) {
      return failure(
        t('pool.delete.hasActiveAgents', { name: pool.config.name, count: pool.status.activeCount }),
        ExitCode.VALIDATION
      );
    }

    await poolService.deletePool(pool.id);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ deleted: pool.id, name: pool.config.name });
    }

    if (mode === 'quiet') {
      return success(pool.id);
    }

    return success({ deleted: pool.id }, t('pool.delete.success', { name: pool.config.name }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('pool.delete.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const poolDeleteCommand: Command = {
  name: 'delete',
  description: t('pool.delete.description'),
  usage: 'sf pool delete <id|name>',
  help: t('pool.delete.help'),
  options: poolDeleteOptions,
  handler: poolDeleteHandler as Command['handler'],
};

// ============================================================================
// Pool Status Command
// ============================================================================

async function poolStatusHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [idOrName] = args;

  if (!idOrName) {
    return failure(t('pool.status.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? t('shared.failedToCreatePoolService'), ExitCode.GENERAL_ERROR);
  }

  try {
    // Find the pool
    let pool: AgentPool | undefined;
    if (idOrName.startsWith('el-')) {
      pool = await poolService.getPool(idOrName as ElementId);
    }
    if (!pool) {
      pool = await poolService.getPoolByName(idOrName);
    }

    if (!pool) {
      return failure(t('pool.status.notFound', { idOrName }), ExitCode.NOT_FOUND);
    }

    // Refresh status from session manager
    const status = await poolService.getPoolStatus(pool.id);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        poolId: pool.id,
        poolName: pool.config.name,
        ...status,
      });
    }

    if (mode === 'quiet') {
      return success(`${status.activeCount}/${pool.config.maxSize}`);
    }

    const lines = [
      `Pool:        ${pool.config.name} (${pool.id})`,
      `Enabled:     ${pool.config.enabled ? 'yes' : 'no'}`,
      '',
      'Capacity:',
      `  Max Size:    ${pool.config.maxSize}`,
      `  Active:      ${status.activeCount}`,
      `  Available:   ${status.availableSlots}`,
      `  Utilization: ${Math.round((status.activeCount / pool.config.maxSize) * 100)}%`,
      '',
      `Last Updated: ${status.lastUpdatedAt}`,
    ];

    if (Object.keys(status.activeByType).length > 0) {
      lines.push('', 'Active by Type:');
      for (const [typeKey, count] of Object.entries(status.activeByType)) {
        lines.push(`  ${typeKey}: ${count}`);
      }
    }

    if (status.activeAgentIds.length > 0) {
      lines.push('', 'Active Agents:');
      for (const agentId of status.activeAgentIds) {
        lines.push(`  - ${agentId}`);
      }
    }

    return success(status, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('pool.status.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const poolStatusCommand: Command = {
  name: 'status',
  description: t('pool.status.description'),
  usage: 'sf pool status <id|name>',
  help: t('pool.status.help'),
  options: [],
  handler: poolStatusHandler as Command['handler'],
};

// ============================================================================
// Pool Refresh Command
// ============================================================================

async function poolRefreshHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { poolService, error } = await createPoolClient(options);
  if (error || !poolService) {
    return failure(error ?? t('shared.failedToCreatePoolService'), ExitCode.GENERAL_ERROR);
  }

  try {
    await poolService.refreshAllPoolStatus();

    const pools = await poolService.listPools();

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(pools);
    }

    if (mode === 'quiet') {
      return success(String(pools.length));
    }

    return success(pools, t('pool.refresh.success', { count: pools.length }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('pool.refresh.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const poolRefreshCommand: Command = {
  name: 'refresh',
  description: t('pool.refresh.description'),
  usage: 'sf pool refresh',
  help: t('pool.refresh.help'),
  options: [],
  handler: poolRefreshHandler as Command['handler'],
};

// ============================================================================
// Main Pool Command
// ============================================================================

export const poolCommand: Command = {
  name: 'pool',
  description: t('pool.description'),
  usage: 'sf pool <subcommand> [options]',
  help: t('pool.help'),
  subcommands: {
    list: poolListCommand,
    show: poolShowCommand,
    create: poolCreateCommand,
    update: poolUpdateCommand,
    delete: poolDeleteCommand,
    status: poolStatusCommand,
    refresh: poolRefreshCommand,
    // Aliases
    ls: poolListCommand,
    get: poolShowCommand,
    add: poolCreateCommand,
    rm: poolDeleteCommand,
  },
  handler: poolListCommand.handler, // Default to list
  options: [],
};
