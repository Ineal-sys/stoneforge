/**
 * Team Commands - Collection command interface for teams
 *
 * Provides CLI commands for team operations:
 * - team create: Create a new team
 * - team add: Add member to team
 * - team remove: Remove member from team
 * - team list: List teams
 * - team members: List team members
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import {
  createTeam,
  isTeamMember,
  isTeamDeleted,
  type Team,
  type CreateTeamInput,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Team Create Command
// ============================================================================

interface TeamCreateOptions {
  name?: string;
  member?: string | string[];
  tag?: string[];
}

const teamCreateOptions: CommandOption[] = [
  {
    name: 'name',
    short: 'n',
    description: t('team.create.option.name'),
    hasValue: true,
    required: true,
  },
  {
    name: 'member',
    short: 'm',
    description: t('label.option.addMember'),
    hasValue: true,
    array: true,
  },
  {
    name: 'tag',
    description: t('label.option.tag'),
    hasValue: true,
    array: true,
  },
];

async function teamCreateHandler(
  _args: string[],
  options: GlobalOptions & TeamCreateOptions
): Promise<CommandResult> {
  if (!options.name) {
    return failure(t('team.create.error.nameRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Handle members
    let members: EntityId[] | undefined;
    if (options.member) {
      members = (Array.isArray(options.member) ? options.member : [options.member]) as EntityId[];
    }

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    const input: CreateTeamInput = {
      name: options.name,
      createdBy: actor,
      ...(members && { members }),
      ...(tags && { tags }),
    };

    const team = await createTeam(input, api.getIdGeneratorConfig());
    const created = await api.create(team as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, t('team.create.success', { id: created.id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('team.error.failedToCreate', { message }), ExitCode.GENERAL_ERROR);
  }
}

const teamCreateCommand: Command = {
  name: 'create',
  description: t('team.create.description'),
  usage: 'sf team create --name <name> [options]',
  help: t('team.create.help'),
  options: teamCreateOptions,
  handler: teamCreateHandler as Command['handler'],
};

// ============================================================================
// Team Add Command
// ============================================================================

async function teamAddHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [teamId, entityId] = args;

  if (!teamId || !entityId) {
    return failure(t('team.add.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // First check if already a member (for better UX message)
    const team = await api.get<Team>(teamId as ElementId);
    if (!team) {
      return failure(t('team.error.notFound', { id: teamId }), ExitCode.NOT_FOUND);
    }
    if (team.type !== 'team') {
      return failure(t('team.error.notTeam', { id: teamId, type: team.type }), ExitCode.VALIDATION);
    }
    if (isTeamMember(team, entityId as EntityId)) {
      return success(team, t('team.add.alreadyMember', { entityId, teamId }));
    }

    // Verify entity exists and is an entity type
    const entity = await api.get<Element>(entityId as ElementId);
    if (!entity) {
      return failure(t('team.error.notFound', { id: entityId }), ExitCode.NOT_FOUND);
    }
    if (entity.type !== 'entity') {
      return failure(t('team.error.notAnEntity', { id: entityId, type: entity.type }), ExitCode.VALIDATION);
    }

    // Use the API method which handles validation, updates, and events
    await api.addTeamMember(
      teamId as ElementId,
      entityId as EntityId,
      { actor }
    );

    return success(
      { teamId, entityId },
      `Added ${entityId} to team ${teamId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('team.error.failedToAdd', { message }), ExitCode.GENERAL_ERROR);
  }
}

const teamAddCommand: Command = {
  name: 'add',
  description: t('team.add.description'),
  usage: 'sf team add <team-id> <entity-id>',
  help: t('team.add.help'),
  handler: teamAddHandler as Command['handler'],
};

// ============================================================================
// Team Remove Command
// ============================================================================

async function teamRemoveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [teamId, entityId] = args;

  if (!teamId || !entityId) {
    return failure(t('team.remove.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // First check if entity is a member (for better UX)
    const team = await api.get<Team>(teamId as ElementId);
    if (!team) {
      return failure(t('team.error.notFound', { id: teamId }), ExitCode.NOT_FOUND);
    }
    if (team.type !== 'team') {
      return failure(t('team.error.notTeam', { id: teamId, type: team.type }), ExitCode.VALIDATION);
    }
    if (!isTeamMember(team, entityId as EntityId)) {
      return success(team, t('team.remove.notMember', { entityId, teamId }));
    }

    // Use the API method which handles validation, updates, and events
    await api.removeTeamMember(
      teamId as ElementId,
      entityId as EntityId,
      { actor }
    );

    return success(
      { teamId, entityId },
      `Removed ${entityId} from team ${teamId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('team.error.failedToRemove', { message }), ExitCode.GENERAL_ERROR);
  }
}

const teamRemoveCommand: Command = {
  name: 'remove',
  description: t('team.remove.description'),
  usage: 'sf team remove <team-id> <entity-id>',
  help: t('team.remove.help'),
  handler: teamRemoveHandler as Command['handler'],
};

// ============================================================================
// Team Delete Command
// ============================================================================

interface TeamDeleteOptions {
  reason?: string;
  force?: boolean;
}

const teamDeleteOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: t('label.option.reason'),
    hasValue: true,
  },
  {
    name: 'force',
    short: 'f',
    description: t('team.delete.option.force'),
    hasValue: false,
  },
];

async function teamDeleteHandler(
  args: string[],
  options: GlobalOptions & TeamDeleteOptions
): Promise<CommandResult> {
  const [teamId] = args;

  if (!teamId) {
    return failure(t('team.delete.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Get team
    const team = await api.get<Team>(teamId as ElementId);
    if (!team) {
      return failure(t('team.error.notFound', { id: teamId }), ExitCode.NOT_FOUND);
    }
    if (team.type !== 'team') {
      return failure(t('team.error.notTeam', { id: teamId, type: team.type }), ExitCode.VALIDATION);
    }

    // Check if already deleted
    if (isTeamDeleted(team)) {
      return failure(t('team.delete.error.alreadyDeleted', { id: teamId }), ExitCode.VALIDATION);
    }

    // Warn if team has members (unless --force)
    if (team.members.length > 0 && !options.force) {
      return failure(
        `Team ${teamId} has ${team.members.length} member(s). Use --force to delete anyway.`,
        ExitCode.VALIDATION
      );
    }

    // Soft delete the team
    await api.delete(teamId as ElementId, { actor, reason: options.reason });

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(teamId);
    }

    return success(
      { teamId, deletedAt: new Date().toISOString() },
      `Deleted team ${teamId}${options.reason ? ` (reason: ${options.reason})` : ''}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('team.error.failedToDelete', { message }), ExitCode.GENERAL_ERROR);
  }
}

const teamDeleteCommand: Command = {
  name: 'delete',
  description: t('team.delete.description'),
  usage: 'sf team delete <team-id> [options]',
  help: t('team.delete.help'),
  options: teamDeleteOptions,
  handler: teamDeleteHandler as Command['handler'],
};

// ============================================================================
// Team List Command
// ============================================================================

interface TeamListOptions {
  member?: string;
  limit?: string;
}

const teamListOptions: CommandOption[] = [
  {
    name: 'member',
    short: 'm',
    description: t('label.option.filterByMember'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function teamListHandler(
  _args: string[],
  options: GlobalOptions & TeamListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'team',
    };

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Team>(filter);

    // Post-filter by member
    let items = result.items;
    if (options.member) {
      items = items.filter((t) => t.members.includes(options.member as EntityId));
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((t) => t.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, t('team.list.empty'));
    }

    // Build table
    const headers = [t('label.id'), 'NAME', 'MEMBERS', 'TAGS', 'CREATED'];
    const rows = items.map((t) => [
      t.id,
      t.name.length > 30 ? t.name.substring(0, 27) + '...' : t.name,
      String(t.members.length),
      t.tags.slice(0, 3).join(', ') + (t.tags.length > 3 ? '...' : ''),
      t.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${t('team.list.summary', { shown: items.length, total: result.total })}`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('team.error.failedToList', { message }), ExitCode.GENERAL_ERROR);
  }
}

const teamListCommand: Command = {
  name: 'list',
  description: t('team.list.description'),
  usage: 'sf team list [options]',
  help: t('team.list.help'),
  options: teamListOptions,
  handler: teamListHandler as Command['handler'],
};

// ============================================================================
// Team Members Command
// ============================================================================

async function teamMembersHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('team.members.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const team = await api.get<Team>(id as ElementId);

    if (!team) {
      return failure(t('team.error.notFound', { id: id }), ExitCode.NOT_FOUND);
    }

    if (team.type !== 'team') {
      return failure(t('team.error.notTeam', { id: id, type: team.type }), ExitCode.VALIDATION);
    }

    const members = team.members;

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success({ members, count: members.length });
    }

    if (mode === 'quiet') {
      return success(members.join('\n'));
    }

    if (members.length === 0) {
      return success({ members: [], count: 0 }, t('label.noMembers'));
    }

    // Build table
    const headers = [t('label.member')];
    const rows = members.map((m) => [m]);

    const table = formatter.table(headers, rows);
    return success(
      { members, count: members.length },
      table + `
${t('team.members.summary', { count: members.length })}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('team.error.failedToList', { message }), ExitCode.GENERAL_ERROR);
  }
}

const teamMembersCommand: Command = {
  name: 'members',
  description: t('team.members.description'),
  usage: 'sf team members <id>',
  help: t('team.members.help'),
  handler: teamMembersHandler as Command['handler'],
};

// ============================================================================
// Team Root Command
// ============================================================================

export const teamCommand: Command = {
  name: 'team',
  description: t('team.description'),
  usage: 'sf team <subcommand> [options]',
  help: t('team.help'),
  subcommands: {
    create: teamCreateCommand,
    add: teamAddCommand,
    remove: teamRemoveCommand,
    delete: teamDeleteCommand,
    list: teamListCommand,
    members: teamMembersCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: teamCreateCommand,
    ls: teamListCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return teamListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(teamCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = t('error.unknownSubcommand', { subcommand: args[0] });
    if (suggestions.length > 0) {
      msg += '\n' + suggestions.map(s => `  ${s}`).join('\n');
    }
    msg += '\n\n' + t('error.runHelp', { command: 'sf team' });
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
