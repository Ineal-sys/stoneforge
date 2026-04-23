/**
 * Message Commands - Message sending and threading CLI interface
 *
 * Provides CLI commands for message operations:
 * - msg send: Send a message to a channel
 * - msg thread: View thread replies
 * - msg list: List messages in a channel
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import {
  createMessage,
  type Message,
  type HydratedMessage,
  type ChannelId,
  type MessageId,
  filterByChannel,
  getThreadMessages,
  sortByCreatedAt,
  isRootMessage,
} from '@stoneforge/core';
import {
  createDocument,
  ContentType,
  DocumentCategory,
  type DocumentId,
} from '@stoneforge/core';
import type { Channel } from '@stoneforge/core';
import {
  isMember,
  isDirectChannel,
  findDirectChannel,
  createDirectChannel,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Message Send Command
// ============================================================================

interface MsgSendOptions {
  channel?: string;
  to?: string;
  replyTo?: string;
  content?: string;
  file?: string;
  thread?: string;
  attachment?: string | string[];
  tag?: string[];
}

const msgSendOptions: CommandOption[] = [
  {
    name: 'channel',
    short: 'c',
    description: t('message.send.option.channel'),
    hasValue: true,
  },
  {
    name: 'to',
    short: 'T',
    description: t('message.send.option.to'),
    hasValue: true,
  },
  {
    name: 'replyTo',
    short: 'r',
    description: t('message.send.option.replyTo'),
    hasValue: true,
  },
  {
    name: 'content',
    short: 'm',
    description: t('message.send.option.content'),
    hasValue: true,
  },
  {
    name: 'file',
    description: t('label.option.file'),
    hasValue: true,
  },
  {
    name: 'thread',
    short: 't',
    description: t('message.send.option.thread'),
    hasValue: true,
  },
  {
    name: 'attachment',
    short: 'a',
    description: t('message.send.option.attachment'),
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

async function msgSendHandler(
  _args: string[],
  options: GlobalOptions & MsgSendOptions
): Promise<CommandResult> {
  // Must specify either --content or --file
  if (!options.content && !options.file) {
    return failure(t('message.error.contentOrFileRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  if (options.content && options.file) {
    return failure(t('message.error.contentAndFile'), ExitCode.INVALID_ARGUMENTS);
  }

  // Must have one of: --channel, --to, or --reply-to
  if (!options.channel && !options.to && !options.replyTo) {
    return failure(t('message.send.error.channelRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    let actor = resolveActor(options);
    let channelId: ChannelId | undefined = options.channel as ChannelId | undefined;
    let threadId: MessageId | null = options.thread ? (options.thread as MessageId) : null;

    // Handle --reply-to: auto-set channel, thread, and swap sender/recipient in DM
    if (options.replyTo) {
      const replyToMessage = await api.get<Message>(options.replyTo as ElementId);
      if (!replyToMessage) {
        return failure(t('message.send.error.replyToNotFound', { id: options.replyTo }), ExitCode.NOT_FOUND);
      }
      if (replyToMessage.type !== 'message') {
        return failure(t('message.error.notMessage', { id: options.replyTo, type: replyToMessage.type }), ExitCode.VALIDATION);
      }

      // Set channel from replied-to message
      channelId = replyToMessage.channelId;

      // Set thread: use replied-to message's thread, or if not in a thread, use the message itself
      threadId = replyToMessage.threadId ?? (replyToMessage.id as MessageId);

      // If in a DM channel and --from/--actor not explicitly set, swap sender/recipient
      if (!options.actor) {
        const replyChannel = await api.get<Channel>(channelId as unknown as ElementId);
        if (replyChannel && isDirectChannel(replyChannel)) {
          // Get the other party in the DM channel
          const otherParty = replyChannel.members.find((m) => m !== replyToMessage.sender);
          if (otherParty) {
            actor = otherParty;
          }
        }
      }
    }

    // Handle --to: find or create DM channel between actor and target
    if (options.to) {
      const toEntity = options.to as EntityId;

      // Validate target entity exists
      const targetEntity = await api.get(toEntity as unknown as ElementId);
      if (!targetEntity) {
        return failure(t('message.send.error.targetNotFound', { id: toEntity }), ExitCode.NOT_FOUND);
      }
      if (targetEntity.type !== 'entity') {
        return failure(t('message.send.error.notAnEntity', { id: toEntity, type: targetEntity.type }), ExitCode.VALIDATION);
      }

      // Find existing DM channel
      const allChannels = await api.list<Channel>({ type: 'channel' });
      let dmChannel = findDirectChannel(allChannels, actor, toEntity);

      // Create DM channel if not found
      if (!dmChannel) {
        // Look up entity names for channel naming
        const actorEntity = await api.get(actor as unknown as ElementId);
        const actorName = (actorEntity as { name?: string } | null)?.name;
        const targetName = (targetEntity as { name?: string }).name;

        const newDmChannel = await createDirectChannel({
          entityA: actor,
          entityB: toEntity,
          createdBy: actor,
          ...(actorName && { entityAName: actorName }),
          ...(targetName && { entityBName: targetName }),
        });
        dmChannel = await api.create<Channel>(newDmChannel as unknown as Channel & Record<string, unknown>);
      }

      channelId = dmChannel.id as unknown as ChannelId;
    }

    if (!channelId) {
      return failure(t('message.send.error.cannotDetermineChannel'), ExitCode.GENERAL_ERROR);
    }

    // Validate channel exists and sender is a member
    const channel = await api.get<Channel>(channelId as unknown as ElementId);
    if (!channel) {
      return failure(t('message.error.notFound', { id: channelId }), ExitCode.NOT_FOUND);
    }
    if (channel.type !== 'channel') {
      return failure(t('message.error.notChannel', { id: channelId, type: channel.type }), ExitCode.VALIDATION);
    }
    if (!isMember(channel, actor)) {
      return failure(t('message.send.error.notMember', { id: channelId }), ExitCode.PERMISSION);
    }

    // Get content
    let content: string;
    if (options.content) {
      content = options.content;
    } else {
      const filePath = resolve(options.file!);
      if (!existsSync(filePath)) {
        return failure(t('message.error.notFound', { id: filePath }), ExitCode.NOT_FOUND);
      }
      content = readFileSync(filePath, 'utf-8');
    }

    // Create content document (immutable, categorized as message content)
    const contentDoc = await createDocument({
      content,
      contentType: ContentType.TEXT,
      createdBy: actor,
      category: DocumentCategory.MESSAGE_CONTENT,
      immutable: true,
    }, api.getIdGeneratorConfig());
    const createdContentDoc = await api.create(contentDoc as unknown as Element & Record<string, unknown>);

    // Validate thread parent if specified (and not already set by --reply-to)
    if (options.thread && !options.replyTo) {
      const threadParent = await api.get<Message>(options.thread as unknown as ElementId);
      if (!threadParent) {
        return failure(t('message.send.error.threadNotFound', { id: options.thread }), ExitCode.NOT_FOUND);
      }
      if (threadParent.type !== 'message') {
        return failure(t('message.send.error.notAMessage', { id: options.thread, type: threadParent.type }), ExitCode.VALIDATION);
      }
      if (threadParent.channelId !== channelId) {
        return failure(t('message.send.error.threadDifferentChannel'), ExitCode.VALIDATION);
      }
      threadId = options.thread as MessageId;
    }

    // Handle attachments
    let attachments: DocumentId[] | undefined;
    if (options.attachment) {
      const attachmentIds = Array.isArray(options.attachment)
        ? options.attachment
        : [options.attachment];
      attachments = [];
      for (const attachmentId of attachmentIds) {
        const attachmentDoc = await api.get(attachmentId as ElementId);
        if (!attachmentDoc) {
          return failure(t('message.send.error.attachmentNotFound', { id: attachmentId }), ExitCode.NOT_FOUND);
        }
        if (attachmentDoc.type !== 'document') {
          return failure(t('message.send.error.attachmentNotDoc', { id: attachmentId, type: attachmentDoc.type }), ExitCode.VALIDATION);
        }
        attachments.push(attachmentId as DocumentId);
      }
    }

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Create the message
    const message = await createMessage({
      channelId,
      sender: actor,
      contentRef: createdContentDoc.id as unknown as DocumentId,
      attachments,
      threadId,
      tags,
    }, api.getIdGeneratorConfig());

    const createdMessage = await api.create<Message>(
      message as unknown as Message & Record<string, unknown>
    );

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(createdMessage.id);
    }

    const replyInfo = threadId ? ` (${t('message.send.replyTo', { id: threadId })})` : '';
    return success(createdMessage, t('message.send.success', { id: createdMessage.id, channelId }) + replyInfo);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('message.error.failedToSend', { message }), ExitCode.GENERAL_ERROR);
  }
}

const msgSendCommand: Command = {
  name: 'send',
  description: t('message.send.description'),
  usage: 'sf message send (--channel <id> | --to <entity> | --reply-to <msg>) --content <text> | --file <path> [options]',
  help: t('message.send.help'),
  options: msgSendOptions,
  handler: msgSendHandler as Command['handler'],
};

// ============================================================================
// Message Thread Command
// ============================================================================

interface MsgThreadOptions {
  limit?: string;
}

const msgThreadOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
];

async function msgThreadHandler(
  args: string[],
  options: GlobalOptions & MsgThreadOptions
): Promise<CommandResult> {
  const [messageId] = args;

  if (!messageId) {
    return failure(t('message.thread.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the root message
    const rootMessage = await api.get<Message>(messageId as ElementId, { hydrate: { content: true } });
    if (!rootMessage) {
      return failure(t('message.error.notFound', { id: messageId }), ExitCode.NOT_FOUND);
    }
    if (rootMessage.type !== 'message') {
      return failure(t('message.error.notMessage', { id: messageId, type: rootMessage.type }), ExitCode.VALIDATION);
    }

    // Get all messages in the channel
    const allMessages = await api.list<Message>({ type: 'message' });
    const channelMessages = filterByChannel(allMessages, rootMessage.channelId);

    // Get thread messages (root + replies)
    const threadMessages = getThreadMessages(channelMessages, messageId as MessageId);

    // Apply limit
    let messages = threadMessages;
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      messages = threadMessages.slice(0, limit);
    }

    // Hydrate content for display
    const hydratedMessages: HydratedMessage[] = [];
    for (const msg of messages) {
      const hydrated = await api.get<HydratedMessage>(msg.id, { hydrate: { content: true } });
      if (hydrated) {
        hydratedMessages.push(hydrated);
      }
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(hydratedMessages);
    }

    if (mode === 'quiet') {
      return success(hydratedMessages.map((m) => m.id).join('\n'));
    }

    if (hydratedMessages.length === 0) {
      return success(null, t('message.thread.empty'));
    }

    // Build table
    const headers = [t('label.id'), 'SENDER', 'CONTENT', 'CREATED'];
    const rows = hydratedMessages.map((m) => {
      const contentPreview = (m.content ?? '').substring(0, 40);
      const truncated = contentPreview.length < (m.content?.length ?? 0) ? '...' : '';
      return [
        m.id,
        m.sender,
        contentPreview + truncated,
        m.createdAt.split('T')[0],
      ];
    });

    const table = formatter.table(headers, rows);
    const threadInfo = isRootMessage(rootMessage)
      ? t('message.thread.rootWith')
      : t('message.thread.replyTo', { id: rootMessage.threadId }) + ' ' + t('message.thread.with');
    const summary = `\n${threadInfo} ${hydratedMessages.length - 1} replies`;

    return success(hydratedMessages, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('message.error.failedToGet', { message }), ExitCode.GENERAL_ERROR);
  }
}

const msgThreadCommand: Command = {
  name: 'thread',
  description: t('message.thread.description'),
  usage: 'sf message thread <message-id> [options]',
  help: t('message.thread.help'),
  options: msgThreadOptions,
  handler: msgThreadHandler as Command['handler'],
};

// ============================================================================
// Message List Command
// ============================================================================

interface MsgListOptions {
  channel: string;
  sender?: string;
  limit?: string;
  rootOnly?: boolean;
}

const msgListOptions: CommandOption[] = [
  {
    name: 'channel',
    short: 'c',
    description: t('message.list.option.channel'),
    hasValue: true,
    required: true,
  },
  {
    name: 'sender',
    short: 's',
    description: t('message.list.option.sender'),
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: t('label.limit'),
    hasValue: true,
  },
  {
    name: 'rootOnly',
    short: 'r',
    description: t('message.list.option.rootOnly'),
    hasValue: false,
  },
];

async function msgListHandler(
  _args: string[],
  options: GlobalOptions & MsgListOptions
): Promise<CommandResult> {
  if (!options.channel) {
    return failure(t('message.list.error.channelRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const channelId = options.channel as ChannelId;

    // Validate channel exists
    const channel = await api.get<Channel>(channelId as unknown as ElementId);
    if (!channel) {
      return failure(t('message.error.notFound', { id: channelId }), ExitCode.NOT_FOUND);
    }
    if (channel.type !== 'channel') {
      return failure(t('message.error.notChannel', { id: channelId, type: channel.type }), ExitCode.VALIDATION);
    }

    // Get all messages
    const allMessages = await api.list<Message>({ type: 'message' });

    // Filter by channel
    let messages = filterByChannel(allMessages, channelId);

    // Filter by sender if specified
    if (options.sender) {
      messages = messages.filter((m) => m.sender === options.sender);
    }

    // Filter root-only if specified
    if (options.rootOnly) {
      messages = messages.filter(isRootMessage);
    }

    // Sort by creation time
    messages = sortByCreatedAt(messages);

    // Apply limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure(t('error.limitPositive'), ExitCode.VALIDATION);
      }
      messages = messages.slice(0, limit);
    }

    // Hydrate content for display
    const hydratedMessages: HydratedMessage[] = [];
    for (const msg of messages) {
      const hydrated = await api.get<HydratedMessage>(msg.id, { hydrate: { content: true } });
      if (hydrated) {
        hydratedMessages.push(hydrated);
      }
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(hydratedMessages);
    }

    if (mode === 'quiet') {
      return success(hydratedMessages.map((m) => m.id).join('\n'));
    }

    if (hydratedMessages.length === 0) {
      return success(null, t('message.list.empty'));
    }

    // Build table
    const headers = [t('label.id'), 'SENDER', 'THREAD', 'CONTENT', 'CREATED'];
    const rows = hydratedMessages.map((m) => {
      const contentPreview = (m.content ?? '').substring(0, 35);
      const truncated = contentPreview.length < (m.content?.length ?? 0) ? '...' : '';
      return [
        m.id,
        m.sender,
        m.threadId ? `→${m.threadId.substring(0, 8)}` : '-',
        contentPreview + truncated,
        m.createdAt.split('T')[0],
      ];
    });

    const table = formatter.table(headers, rows);
    const summary = `\n${t('message.list.summary', { count: hydratedMessages.length, channelId })}`;

    return success(hydratedMessages, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('message.error.failedToList', { message }), ExitCode.GENERAL_ERROR);
  }
}

const msgListCommand: Command = {
  name: 'list',
  description: t('message.list.description'),
  usage: 'sf message list --channel <id> [options]',
  help: t('message.list.help'),
  options: msgListOptions,
  handler: msgListHandler as Command['handler'],
};

// ============================================================================
// Message Reply Command
// ============================================================================

interface MsgReplyOptions {
  content?: string;
  file?: string;
  attachment?: string | string[];
  tag?: string[];
}

const msgReplyOptions: CommandOption[] = [
  {
    name: 'content',
    short: 'm',
    description: t('message.send.option.content'),
    hasValue: true,
  },
  {
    name: 'file',
    description: t('label.option.file'),
    hasValue: true,
  },
  {
    name: 'attachment',
    short: 'a',
    description: t('message.send.option.attachment'),
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

async function msgReplyHandler(
  args: string[],
  options: GlobalOptions & MsgReplyOptions
): Promise<CommandResult> {
  const [messageId] = args;

  if (!messageId) {
    return failure(t('message.reply.usage'), ExitCode.INVALID_ARGUMENTS);
  }

  // Delegate to send handler with --reply-to set
  return msgSendHandler([], {
    ...options,
    replyTo: messageId,
  } as GlobalOptions & MsgSendOptions);
}

const msgReplyCommand: Command = {
  name: 'reply',
  description: t('message.reply.description'),
  usage: 'sf message reply <message-id> --content <text> | --file <path> [options]',
  help: t('message.reply.help'),
  options: msgReplyOptions,
  handler: msgReplyHandler as Command['handler'],
};

// ============================================================================
// Message Root Command
// ============================================================================

export const messageCommand: Command = {
  name: 'message',
  description: t('message.description'),
  usage: 'sf message <subcommand> [options]',
  help: t('message.help'),
  subcommands: {
    send: msgSendCommand,
    reply: msgReplyCommand,
    list: msgListCommand,
    thread: msgThreadCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    ls: msgListCommand,
  },
  handler: async (args, _options): Promise<CommandResult> => {
    if (args.length === 0) {
      return failure(
        t('message.usage'),
        ExitCode.INVALID_ARGUMENTS
      );
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(messageCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = t('error.unknownSubcommand', { subcommand: args[0] });
    if (suggestions.length > 0) {
      msg += '\n' + suggestions.map(s => `  ${s}`).join('\n');
    }
    msg += '\n\n' + t('error.runHelp', { command: 'sf message' });
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
