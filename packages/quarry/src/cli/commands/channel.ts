/**
 * Channel Commands - Collection command interface for channels
 *
 * Provides CLI commands for channel operations:
 * - channel create: Create a new channel
 * - channel join: Join a channel
 * - channel leave: Leave a channel
 * - channel list: List channels
 * - channel members: List channel members
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import {
  createGroupChannel,
  createDirectChannel,
  type Channel,
  type CreateGroupChannelInput,
  type CreateDirectChannelInput,
  ChannelTypeValue,
  VisibilityValue,
  JoinPolicyValue,
  isMember,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Channel Create Command
// ============================================================================

interface ChannelCreateOptions {
  name?: string;
  description?: string;
  type?: string;
  visibility?: string;
  policy?: string;
  member?: string | string[];
  direct?: string;
  tag?: string[];
}

const channelCreateOptions: CommandOption[] = [
  {
    name: 'name',
    short: 'n',
    description: t('channel.create.option.name'),
    hasValue: true,
  },
  {
    name: 'description',
    short: 'D',
    description: t('channel.create.option.description'),
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: t('channel.create.option.type'),
    hasValue: true,
  },
  {
    name: 'visibility',
    description: t('channel.create.option.visibility'),
    hasValue: true,
  },
  {
    name: 'policy',
    short: 'p',
    description: t('channel.create.option.policy'),
    hasValue: true,
  },
  {
    name: 'member',
    short: 'm',
    description: t('label.option.addMember'),
    hasValue: true,
    array: true,
  },
  {
    name: 'direct',
    short: 'd',
    description: t('channel.create.option.direct'),
    hasValue: true,
  },
  {
    name: 'tag',
    description: t('label.option.tag'),
    hasValue: true,
    array: true,
  },
];

async function channelCreateHandler(
  _args: string[],
  options: GlobalOptions & ChannelCreateOptions
): Promise<CommandResult> {
  const channelType = (options.type || 'group') as 'group' | 'direct';

  if (channelType !== 'group' && channelType !== 'direct') {
    return failure(t('channel.create.error.invalidType', { type: channelType }), ExitCode.VALIDATION);
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

    let channel: Channel;

    if (channelType === 'direct') {
      if (!options.direct) {
        return failure(t('channel.create.error.directRequired'), ExitCode.INVALID_ARGUMENTS);
      }

      const input: CreateDirectChannelInput = {
        entityA: actor,
        entityB: options.direct as EntityId,
        createdBy: actor,
        ...(options.description && { description: options.description }),
        ...(tags && { tags }),
      };

      channel = await createDirectChannel(input);
    } else {
      if (!options.name) {
        return failure(t('channel.create.error.nameRequired'), ExitCode.INVALID_ARGUMENTS);
      }

      // Validate visibility
      const visibility = (options.visibility || 'private') as 'public' | 'private';
      if (!Object.values(VisibilityValue).includes(visibility)) {
        return failure(
          `Invalid visibility: ${visibility}. Must be 'public' or 'private'`,
          ExitCode.VALIDATION
        );
      }

      // Validate join policy
      const joinPolicy = (options.policy || 'invite-only') as 'open' | 'invite-only' | 'request';
      if (!Object.values(JoinPolicyValue).includes(joinPolicy)) {
        return failure(
          `Invalid join policy: ${joinPolicy}. Must be 'open', 'invite-only', or 'request'`,
          ExitCode.VALIDATION
        );
      }

      // Parse members
      let members: EntityId[] | undefined;
      if (options.member) {
        members = (Array.isArray(options.member) ? options.member : [options.member]) as EntityId[];
      }

      const input: CreateGroupChannelInput = {
        name: options.name,
        createdBy: actor,
        description: options.description ?? null,
        visibility,
        joinPolicy,
        ...(members && { members }),
        ...(tags && { tags }),
      };

      channel = await createGroupChannel(input);
    }

    const created = await api.create(channel as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, t('channel.create.success', { type: channelType, id: created.id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('channel.error.failedToCreate', { message }), ExitCode.GENERAL_ERROR);
  }
}

const channelCreateCommand: Command = {
  name: 'create',
  description: t('channel.create.description'),
  usage: 'sf channel create [options]',
  help: t('channel.create.help'),
  options: channelCreateOptions,
  handler: channelCreateHandler as Command['handler'],
};

// ============================================================================
// Channel Join Command
// ============================================================================

async function channelJoinHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('channel.join.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const channel = await api.get<Channel>(id as ElementId);

    if (!channel) {
      return failure(t('channel.error.notFound', { id: id }), ExitCode.NOT_FOUND);
    }

    if (channel.type !== 'channel') {
      return failure(t('channel.error.notChannel', { id: id, type: channel.type }), ExitCode.VALIDATION);
    }

    if (channel.channelType === ChannelTypeValue.DIRECT) {
      return failure(t('channel.join.error.cannotJoinDirect'), ExitCode.VALIDATION);
    }

    if (isMember(channel, actor)) {
      return success(channel, t('channel.join.alreadyMember', { id }));
    }

    // Check join policy
    if (channel.permissions.joinPolicy === JoinPolicyValue.INVITE_ONLY) {
      return failure(t('channel.join.error.inviteOnly'), ExitCode.VALIDATION);
    }

    if (channel.permissions.joinPolicy === JoinPolicyValue.OPEN &&
        channel.permissions.visibility !== VisibilityValue.PUBLIC) {
      return failure(t('channel.join.error.private'), ExitCode.VALIDATION);
    }

    // Add actor to members
    const newMembers = [...channel.members, actor];
    const updated = await api.update<Channel>(
      id as ElementId,
      { members: newMembers },
      { actor }
    );

    return success(updated, t('channel.join.success', { id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('channel.error.failedToJoin', { message }), ExitCode.GENERAL_ERROR);
  }
}

const channelJoinCommand: Command = {
  name: 'join',
  description: t('channel.join.description'),
  usage: 'sf channel join <id>',
  help: t('channel.join.help'),
  handler: channelJoinHandler as Command['handler'],
};

// ============================================================================
// Channel Leave Command
// ============================================================================

async function channelLeaveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('channel.leave.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const result = await api.leaveChannel(id as ElementId, actor);
    return success(result.channel, t('channel.leave.success', { id }));
  } catch (err) {
    // Handle specific error cases with user-friendly messages
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return failure(t('channel.error.notFound', { id: id }), ExitCode.NOT_FOUND);
      }
      if (err.message.includes('not a channel')) {
        return failure(t('channel.error.notAChannel', { id }), ExitCode.VALIDATION);
      }
      if (err.message.includes('Cannot leave a direct channel')) {
        return failure(t('channel.leave.error.cannotLeaveDirect'), ExitCode.VALIDATION);
      }
      if (err.message.includes('not a member')) {
        // Not an error - just inform the user
        const channel = await api.get<Channel>(id as ElementId);
        return success(channel, t('channel.leave.notMember', { id }));
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('channel.error.failedToLeave', { message }), ExitCode.GENERAL_ERROR);
  }
}

const channelLeaveCommand: Command = {
  name: 'leave',
  description: t('channel.leave.description'),
  usage: 'sf channel leave <id>',
  help: t('channel.leave.help'),
  handler: channelLeaveHandler as Command['handler'],
};

// ============================================================================
// Channel List Command
// ============================================================================

interface ChannelListOptions {
  type?: string;
  member?: string;
  limit?: string;
}

const channelListOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: t('channel.list.option.type'),
    hasValue: true,
  },
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

async function channelListHandler(
  _args: string[],
  options: GlobalOptions & ChannelListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'channel',
    };

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Channel>(filter);

    // Post-filter
    let items = result.items;

    // Type filter
    if (options.type) {
      if (options.type !== 'group' && options.type !== 'direct') {
        return failure(
          `Invalid type: ${options.type}. Must be 'group' or 'direct'`,
          ExitCode.VALIDATION
        );
      }
      items = items.filter((c) => c.channelType === options.type);
    }

    // Member filter
    if (options.member) {
      items = items.filter((c) => c.members.includes(options.member as EntityId));
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((c) => c.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, t('channel.list.empty'));
    }

    // Build table
    const headers = [t('label.id'), 'NAME', 'TYPE', 'MEMBERS', 'VISIBILITY', 'DESCRIPTION', 'CREATED'];
    const rows = items.map((c) => {
      const desc = c.description ?? '';
      const truncDesc = desc.length > 30 ? desc.substring(0, 27) + '...' : desc;
      return [
        c.id,
        c.name.length > 25 ? c.name.substring(0, 22) + '...' : c.name,
        c.channelType,
        String(c.members.length),
        c.permissions.visibility,
        truncDesc,
        c.createdAt.split('T')[0],
      ];
    });

    const table = formatter.table(headers, rows);
    const summary = `\n${t('channel.list.summary', { shown: items.length, total: result.total })}`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('channel.error.failedToList', { message }), ExitCode.GENERAL_ERROR);
  }
}

const channelListCommand: Command = {
  name: 'list',
  description: t('channel.list.description'),
  usage: 'sf channel list [options]',
  help: t('channel.list.help'),
  options: channelListOptions,
  handler: channelListHandler as Command['handler'],
};

// ============================================================================
// Channel Members Command
// ============================================================================

async function channelMembersHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('channel.members.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const channel = await api.get<Channel>(id as ElementId);

    if (!channel) {
      return failure(t('channel.error.notFound', { id: id }), ExitCode.NOT_FOUND);
    }

    if (channel.type !== 'channel') {
      return failure(t('channel.error.notChannel', { id: id, type: channel.type }), ExitCode.VALIDATION);
    }

    const members = channel.members;
    const modifiers = channel.permissions.modifyMembers;

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success({ members, modifiers, count: members.length });
    }

    if (mode === 'quiet') {
      return success(members.join('\n'));
    }

    if (members.length === 0) {
      return success({ members: [], count: 0 }, t('label.noMembers'));
    }

    // Build table
    const headers = [t('label.member'), t('label.role')];
    const rows = members.map((m) => [
      m,
      modifiers.includes(m) ? 'moderator' : 'member',
    ]);

    const table = formatter.table(headers, rows);
    return success(
      { members, modifiers, count: members.length },
      table + `
${t('channel.members.summary', { count: members.length })}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('channel.error.failedToList', { message }), ExitCode.GENERAL_ERROR);
  }
}

const channelMembersCommand: Command = {
  name: 'members',
  description: t('channel.members.description'),
  usage: 'sf channel members <id>',
  help: t('channel.members.help'),
  handler: channelMembersHandler as Command['handler'],
};

// ============================================================================
// Channel Add Command
// ============================================================================

async function channelAddHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id, entityId] = args;

  if (!id || !entityId) {
    return failure(t('channel.add.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const result = await api.addChannelMember(id as ElementId, entityId as EntityId, { actor });

    if (result.success) {
      return success(result.channel, t('channel.add.success', { entityId, id }));
    }
    return failure(t('channel.error.addFailed'), ExitCode.GENERAL_ERROR);
  } catch (err) {
    // Handle specific error cases with user-friendly messages
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return failure(t('channel.error.notFound', { id: id }), ExitCode.NOT_FOUND);
      }
      if (err.message.includes('not a channel')) {
        return failure(t('channel.error.notAChannel', { id }), ExitCode.VALIDATION);
      }
      if (err.message.includes('direct channel')) {
        return failure(t('channel.error.cannotModifyDirect'), ExitCode.VALIDATION);
      }
      if (err.message.includes('Cannot modify members')) {
        return failure(t('channel.error.noPermissionAdd'), ExitCode.PERMISSION);
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('channel.error.failedToAdd', { message }), ExitCode.GENERAL_ERROR);
  }
}

const channelAddCommand: Command = {
  name: 'add',
  description: t('channel.add.description'),
  usage: 'sf channel add <channel-id> <entity-id>',
  help: t('channel.add.help'),
  handler: channelAddHandler as Command['handler'],
};

// ============================================================================
// Channel Remove Command
// ============================================================================

async function channelRemoveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id, entityId] = args;

  if (!id || !entityId) {
    return failure(t('channel.remove.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const result = await api.removeChannelMember(id as ElementId, entityId as EntityId, { actor });

    if (result.success) {
      return success(result.channel, t('channel.remove.success', { entityId, id }));
    }
    return failure(t('channel.error.removeFailed'), ExitCode.GENERAL_ERROR);
  } catch (err) {
    // Handle specific error cases with user-friendly messages
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return failure(t('channel.error.notFound', { id: id }), ExitCode.NOT_FOUND);
      }
      if (err.message.includes('not a channel')) {
        return failure(t('channel.error.notAChannel', { id }), ExitCode.VALIDATION);
      }
      if (err.message.includes('direct channel')) {
        return failure(t('channel.error.cannotModifyDirect'), ExitCode.VALIDATION);
      }
      if (err.message.includes('not a member')) {
        return failure(t('channel.remove.error.notMember', { entityId }), ExitCode.VALIDATION);
      }
      if (err.message.includes('Cannot modify members')) {
        return failure(t('channel.error.noPermissionRemove'), ExitCode.PERMISSION);
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('channel.error.failedToRemove', { message }), ExitCode.GENERAL_ERROR);
  }
}

const channelRemoveCommand: Command = {
  name: 'remove',
  description: t('channel.remove.description'),
  usage: 'sf channel remove <channel-id> <entity-id>',
  help: t('channel.remove.help'),
  handler: channelRemoveHandler as Command['handler'],
};

// ============================================================================
// Channel Merge Command
// ============================================================================

async function channelMergeHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const sourceId = (options as Record<string, unknown>).source as string | undefined;
  const targetId = (options as Record<string, unknown>).target as string | undefined;
  const newName = (options as Record<string, unknown>).name as string | undefined;

  if (!sourceId || !targetId) {
    return failure(t('channel.merge.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const result = await api.mergeChannels(
      sourceId as ElementId,
      targetId as ElementId,
      { newName, actor }
    );

    return success(result, t('channel.merge.success', { source: sourceId, target: targetId, messages: result.messagesMoved }));
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return failure(t('channel.error.notFound'), ExitCode.NOT_FOUND);
      }
      if (err.message.includes('not a group')) {
        return failure(t('channel.merge.error.onlyGroup'), ExitCode.VALIDATION);
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('channel.error.failedToMerge', { message }), ExitCode.GENERAL_ERROR);
  }
}

const channelMergeOptions: CommandOption[] = [
  { name: 'source', short: 's', hasValue: true, description: t('channel.merge.option.source'), required: true },
  { name: 'target', short: 't', hasValue: true, description: t('channel.merge.option.target'), required: true },
  { name: 'name', short: 'n', hasValue: true, description: t('channel.merge.option.name') },
];

const channelMergeCommand: Command = {
  name: 'merge',
  description: t('channel.merge.description'),
  usage: 'sf channel merge --source <id> --target <id> [--name <new-name>]',
  options: channelMergeOptions,
  help: t('channel.merge.help'),
  handler: channelMergeHandler as Command['handler'],
};

// ============================================================================
// Channel Root Command
// ============================================================================

export const channelCommand: Command = {
  name: 'channel',
  description: t('channel.description'),
  usage: 'sf channel <subcommand> [options]',
  help: t('channel.help'),
  subcommands: {
    create: channelCreateCommand,
    join: channelJoinCommand,
    leave: channelLeaveCommand,
    list: channelListCommand,
    members: channelMembersCommand,
    add: channelAddCommand,
    remove: channelRemoveCommand,
    merge: channelMergeCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: channelCreateCommand,
    ls: channelListCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return channelListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(channelCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = t('error.unknownSubcommand', { subcommand: args[0] });
    if (suggestions.length > 0) {
      msg += '\n' + suggestions.map(s => `  ${s}`).join('\n');
    }
    msg += '\n\n' + t('error.runHelp', { command: 'sf channel' });
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
