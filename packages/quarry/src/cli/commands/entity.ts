/**
 * Entity Commands - Entity registration and listing
 *
 * Provides CLI commands for entity operations:
 * - entity register: Register a new entity (agent, human, or system)
 * - entity list: List all registered entities
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { t } from '../i18n/index.js';
import { createEntity, EntityTypeValue, type Entity, type CreateEntityInput } from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { getFormatter } from '../formatter.js';
import { ValidationError, ConflictError } from '@stoneforge/core';
import { getValue, loadConfig } from '../../config/index.js';
import { isValidPublicKey } from '../../systems/identity.js';
import { createAPI as createSharedAPI } from '../db.js';

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

// ============================================================================
// Entity Register Command
// ============================================================================

interface RegisterOptions extends GlobalOptions {
  type?: string;
  'public-key'?: string;
  tag?: string[];
}

async function entityRegisterHandler(
  args: string[],
  options: RegisterOptions
): Promise<CommandResult> {
  if (args.length === 0) {
    return failure(t('entity.register.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const name = args[0];
  const entityType = (options.type || 'agent') as EntityTypeValue;

  // Validate entity type
  const validTypes = Object.values(EntityTypeValue);
  if (!validTypes.includes(entityType)) {
    return failure(
      t('entity.register.error.invalidType', { type: entityType, valid: validTypes.join(', ') }),
      ExitCode.VALIDATION
    );
  }

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    const actor = getActor(options);
    const tags = options.tag || [];
    const publicKey = options['public-key'];

    // Validate public key format if provided
    if (publicKey !== undefined) {
      if (!isValidPublicKey(publicKey)) {
        return failure(
          t('entity.register.error.invalidPublicKey'),
          ExitCode.VALIDATION
        );
      }
    }

    const input: CreateEntityInput = {
      name,
      entityType,
      createdBy: actor as EntityId,
      ...(publicKey && { publicKey }),
      ...(tags.length > 0 && { tags }),
    };

    // Create the entity
    const entity = await createEntity(input, api.getIdGeneratorConfig());
    // Persist to database
    const created = await api.create(entity as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(created);
    }

    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(
      created,
      t('entity.register.success', { type: entityType, name, id: created.id })
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return failure(t('entity.register.error.validation', { message: err.message }), ExitCode.VALIDATION);
    }
    if (err instanceof ConflictError) {
      return failure(t('entity.register.error.exists', { message: err.message }), ExitCode.VALIDATION);
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('entity.register.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

const registerOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: t('entity.register.option.type'),
    hasValue: true,
  },
  {
    name: 'public-key',
    description: t('entity.register.option.publicKey'),
    hasValue: true,
  },
  {
    name: 'tag',
    description: t('entity.register.option.tag'),
    hasValue: true,
    array: true,
  },
];

// ============================================================================
// Entity List Command
// ============================================================================

interface ListOptions extends GlobalOptions {
  type?: string;
  limit?: number;
}

async function entityListHandler(
  _args: string[],
  options: ListOptions
): Promise<CommandResult> {
  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'entity' as const,
    };

    if (options.limit) {
      filter.limit = options.limit;
    }

    // Get entities
    const entities = await api.list<Entity>(filter);

    // Filter by entity type if specified
    let filteredEntities = entities;
    if (options.type) {
      filteredEntities = entities.filter((e) => e.entityType === options.type);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(filteredEntities);
    }

    if (mode === 'quiet') {
      return success(filteredEntities.map((e) => e.id).join('\n'));
    }

    if (filteredEntities.length === 0) {
      return success(filteredEntities, t('entity.list.success.noEntities'));
    }

    // Human-readable output
    const lines: string[] = [];
    lines.push(t('entity.list.label.entities'));
    lines.push('');

    for (const entity of filteredEntities) {
      const typeIcon = getEntityTypeIcon(entity.entityType);
      const keyIndicator = entity.publicKey ? ' \u{1F511}' : '';
      lines.push(`${typeIcon} ${entity.name} (${entity.id})${keyIndicator}`);
      lines.push(`   ${t('entity.list.label.type')}: ${entity.entityType}`);
      if (entity.tags.length > 0) {
        lines.push(`   ${t('entity.list.label.tags')}: ${entity.tags.join(', ')}`);
      }
    }

    lines.push('');
    lines.push(t('entity.list.label.total', { count: filteredEntities.length }));

    return success(filteredEntities, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('entity.list.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

function getEntityTypeIcon(entityType: EntityTypeValue): string {
  switch (entityType) {
    case EntityTypeValue.AGENT:
      return '[A]';
    case EntityTypeValue.HUMAN:
      return '[H]';
    case EntityTypeValue.SYSTEM:
      return '[S]';
    default:
      return '[?]';
  }
}

const listOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: t('entity.list.option.type'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('entity.list.option.limit'),
    hasValue: true,
  },
];

// ============================================================================
// Entity Lookup Helper
// ============================================================================

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
// Set Manager Command
// ============================================================================

async function setManagerHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure(
      t('entity.setManager.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [entityArg, managerArg] = args;

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Resolve entity
    const entity = await resolveEntity(api, entityArg);
    if (!entity) {
      return failure(t('entity.error.notFound', { id: entityArg }), ExitCode.NOT_FOUND);
    }

    // Resolve manager
    const manager = await resolveEntity(api, managerArg);
    if (!manager) {
      return failure(t('entity.setManager.error.managerNotFound', { id: managerArg }), ExitCode.NOT_FOUND);
    }

    const actor = getActor(options);

    // Set the manager
    const updated = await api.setEntityManager(
      entity.id as unknown as EntityId,
      manager.id as unknown as EntityId,
      actor as EntityId
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(
      updated,
      t('entity.setManager.success', { name: entity.name, managerName: manager.name })
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return failure(t('entity.error.validation', { message: err.message }), ExitCode.VALIDATION);
    }
    if (err instanceof ConflictError) {
      return failure(t('entity.error.conflict', { message: err.message }), ExitCode.VALIDATION);
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('entity.setManager.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const setManagerCommand: Command = {
  name: 'set-manager',
  description: t('entity.setManager.description'),
  usage: 'sf entity set-manager <entity> <manager>',
  help: t('entity.setManager.help'),
  options: [],
  handler: setManagerHandler as Command['handler'],
};

// ============================================================================
// Clear Manager Command
// ============================================================================

async function clearManagerHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('entity.clearManager.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [entityArg] = args;

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Resolve entity
    const entity = await resolveEntity(api, entityArg);
    if (!entity) {
      return failure(t('entity.error.notFound', { id: entityArg }), ExitCode.NOT_FOUND);
    }

    const actor = getActor(options);

    // Clear the manager
    const updated = await api.clearEntityManager(
      entity.id as unknown as EntityId,
      actor as EntityId
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, t('entity.clearManager.success', { name: entity.name }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('entity.clearManager.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const clearManagerCommand: Command = {
  name: 'clear-manager',
  description: t('entity.clearManager.description'),
  usage: 'sf entity clear-manager <entity>',
  help: t('entity.clearManager.help'),
  options: [],
  handler: clearManagerHandler as Command['handler'],
};

// ============================================================================
// Reports Command (Direct Reports)
// ============================================================================

async function reportsHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('entity.reports.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [managerArg] = args;

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Resolve manager
    const manager = await resolveEntity(api, managerArg);
    if (!manager) {
      return failure(t('entity.reports.error.managerNotFound', { id: managerArg }), ExitCode.NOT_FOUND);
    }

    // Get direct reports
    const reports = await api.getDirectReports(manager.id as unknown as EntityId);

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(reports);
    }

    if (mode === 'quiet') {
      return success(reports.map((e) => e.id).join('\n'));
    }

    if (reports.length === 0) {
      return success(reports, t('entity.reports.success.noReports', { name: manager.name }));
    }

    // Human-readable table output
    const headers = [t('label.id'), t('label.name'), t('label.type')];
    const rows = reports.map((entity) => {
      const e = entity as Entity;
      return [e.id, e.name, e.entityType];
    });

    const table = formatter.table(headers, rows);
    const summary = `\n${t('entity.reports.summary', { count: reports.length, name: manager.name })}`;

    return success(reports, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('entity.reports.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const reportsCommand: Command = {
  name: 'reports',
  description: t('entity.reports.description'),
  usage: 'sf entity reports <manager>',
  help: t('entity.reports.help'),
  options: [],
  handler: reportsHandler as Command['handler'],
};

// ============================================================================
// Chain Command (Management Chain)
// ============================================================================

async function chainHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(
      t('entity.chain.usage'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const [entityArg] = args;

  try {
    const { api, error: dbError } = createSharedAPI(options, true);
    if (dbError) {
      return failure(dbError, ExitCode.NOT_FOUND);
    }

    // Resolve entity
    const entity = await resolveEntity(api, entityArg);
    if (!entity) {
      return failure(t('entity.error.notFound', { id: entityArg }), ExitCode.NOT_FOUND);
    }

    // Get management chain
    const chain = await api.getManagementChain(entity.id as unknown as EntityId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(chain);
    }

    if (mode === 'quiet') {
      return success(chain.map((e) => e.id).join('\n'));
    }

    if (chain.length === 0) {
      return success(chain, t('entity.chain.success.noManager', { name: entity.name }));
    }

    // Human-readable visual chain
    const names = [entity.name, ...chain.map((e) => (e as Entity).name)];
    const chainDisplay = names.join(' -> ');

    return success(chain, t('entity.chain.success.display', { chain: chainDisplay }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('entity.chain.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const chainCommand: Command = {
  name: 'chain',
  description: t('entity.chain.description'),
  usage: 'sf entity chain <entity>',
  help: t('entity.chain.help'),
  options: [],
  handler: chainHandler as Command['handler'],
};

// ============================================================================
// Command Definitions
// ============================================================================

export const entityRegisterCommand: Command = {
  name: 'register',
  description: t('entity.register.description'),
  usage: 'sf entity register <name> [--type <type>]',
  help: t('entity.register.help'),
  options: registerOptions,
  handler: entityRegisterHandler as Command['handler'],
};

export const entityListCommand: Command = {
  name: 'list',
  description: t('entity.list.description'),
  usage: 'sf entity list [--type <type>]',
  help: t('entity.list.help'),
  options: listOptions,
  handler: entityListHandler as Command['handler'],
};

export const entityCommand: Command = {
  name: 'entity',
  description: t('entity.description'),
  usage: 'sf entity <subcommand>',
  help: t('entity.help'),
  handler: async (args: string[], options: GlobalOptions): Promise<CommandResult> => {
    // Default to list if no subcommand
    return entityListHandler(args, options as ListOptions);
  },
  subcommands: {
    register: entityRegisterCommand,
    list: entityListCommand,
    'set-manager': setManagerCommand,
    'clear-manager': clearManagerCommand,
    reports: reportsCommand,
    chain: chainCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    ls: entityListCommand,
    create: entityRegisterCommand,
  },
};
