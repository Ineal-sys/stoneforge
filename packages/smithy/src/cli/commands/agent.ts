/**
 * Agent Commands - CLI operations for orchestrator agents
 *
 * Provides commands for agent management:
 * - agent list: List all registered agents
 * - agent show <id>: Show agent details
 * - agent register <name>: Register a new agent
 * - agent start <id>: Start (spawn) a Claude Code process for an agent
 * - agent stop <id>: Stop an agent session
 * - agent stream <id>: Get agent channel for streaming
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getFormatter, getOutputMode, OPERATOR_ENTITY_ID } from '@stoneforge/quarry/cli';
import type { EntityId, ElementId } from '@stoneforge/core';
import type { AgentRole, WorkerMode, StewardFocus } from '../../types/index.js';
import type { OrchestratorAPI, AgentEntity } from '../../api/index.js';
import { t } from '../i18n/index.js';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates orchestrator API client
 */
async function createOrchestratorClient(options: GlobalOptions): Promise<{
  api: OrchestratorAPI | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createOrchestratorAPI } = await import('../../api/index.js');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return {
        api: null,
        error: t('agent.noStoneforge'),
      };
    }

    const dbPath = options.db ?? `${stoneforgeDir}/stoneforge.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createOrchestratorAPI(backend);

    return { api };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { api: null, error: t('agent.apiInitFailed', { message }) };
  }
}

/**
 * Gets agent metadata from agent entity
 */
function getAgentMeta(agent: AgentEntity): Record<string, unknown> {
  return (agent.metadata?.agent ?? {}) as unknown as Record<string, unknown>;
}

/**
 * Streams output from a spawned session's event emitter
 * This is a long-running operation that continues until the session ends
 */
async function streamSpawnedSession(
  events: import('node:events').EventEmitter,
  sessionMode: 'headless' | 'interactive'
): Promise<void> {
  return new Promise((resolve) => {
    const onInterrupt = () => {
      console.log('\n' + t('agent.start.streamInterrupted'));
      cleanup();
      resolve();
    };

    const cleanup = () => {
      process.off('SIGINT', onInterrupt);
      events.off('event', onEvent);
      events.off('pty-data', onPtyData);
      events.off('exit', onExit);
      events.off('error', onError);
    };

    const onEvent = (event: { type: string; message?: string; tool?: { name?: string } }) => {
      if (event.type === 'assistant' && event.message) {
        process.stdout.write(event.message);
      } else if (event.type === 'tool_use' && event.tool?.name) {
        console.log('\n' + t('agent.start.tool', { name: event.tool.name }));
      } else if (event.type === 'result' && event.message) {
        console.log('\n' + t('agent.start.result', { message: event.message }));
      }
    };

    const onPtyData = (data: string) => {
      process.stdout.write(data);
    };

    const onExit = (code: number | null, signal: string | null) => {
      // User-friendly message for normal exit, show exit code for debugging on errors
      const exitMessage = code === 0
        ? t('agent.start.agentStopped')
        : t('agent.start.agentUnexpectedExit', { code: String(code), signal: signal ? ` (signal: ${signal})` : '' });
      console.log(`\n[${exitMessage}]`);
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      console.error('\n' + t('agent.start.error', { message: error.message }));
    };

    process.on('SIGINT', onInterrupt);

    if (sessionMode === 'headless') {
      events.on('event', onEvent);
    } else {
      events.on('pty-data', onPtyData);
    }

    events.on('exit', onExit);
    events.on('error', onError);
  });
}

// ============================================================================
// Agent List Command
// ============================================================================

interface AgentListOptions {
  role?: string;
  status?: string;
  workerMode?: string;
  focus?: string;
  reportsTo?: string;
  hasSession?: boolean;
}

const agentListOptions: CommandOption[] = [
  {
    name: 'role',
    short: 'r',
    description: t('agent.list.option.role'),
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: t('agent.list.option.status'),
    hasValue: true,
  },
  {
    name: 'workerMode',
    short: 'm',
    description: t('agent.list.option.workerMode'),
    hasValue: true,
  },
  {
    name: 'focus',
    short: 'f',
    description: t('agent.list.option.focus'),
    hasValue: true,
  },
  {
    name: 'reportsTo',
    description: t('agent.list.option.reportsTo'),
    hasValue: true,
  },
  {
    name: 'hasSession',
    description: t('agent.list.option.hasSession'),
  },
];

async function agentListHandler(
  _args: string[],
  options: GlobalOptions & AgentListOptions
): Promise<CommandResult> {
  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    let agents: AgentEntity[];

    // Filter by role if specified
    if (options.role) {
      const validRoles = ['director', 'worker', 'steward'];
      if (!validRoles.includes(options.role)) {
        return failure(
          t('agent.list.invalidRole', { role: options.role, validRoles: validRoles.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      agents = await api.getAgentsByRole(options.role as AgentRole);
    } else {
      agents = await api.listAgents();
    }

    // Additional filter by status
    if (options.status) {
      const validStatuses = ['idle', 'running', 'suspended', 'terminated'];
      if (!validStatuses.includes(options.status)) {
        return failure(
          t('agent.list.invalidStatus', { status: options.status, validStatuses: validStatuses.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      agents = agents.filter((a) => {
        const meta = getAgentMeta(a);
        return meta.sessionStatus === options.status;
      });
    }

    // Filter by worker mode
    if (options.workerMode) {
      const validModes = ['ephemeral', 'persistent'];
      if (!validModes.includes(options.workerMode)) {
        return failure(
          t('agent.list.invalidWorkerMode', { workerMode: options.workerMode, validModes: validModes.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      agents = agents.filter((a) => {
        const meta = getAgentMeta(a);
        return meta.workerMode === options.workerMode;
      });
    }

    // Filter by steward focus
    if (options.focus) {
      const validFocuses = ['merge', 'docs', 'recovery', 'custom'];
      if (!validFocuses.includes(options.focus)) {
        return failure(
          t('agent.list.invalidFocus', { focus: options.focus, validFocuses: validFocuses.join(', ') }),
          ExitCode.VALIDATION
        );
      }
      agents = agents.filter((a) => {
        const meta = getAgentMeta(a);
        return meta.stewardFocus === options.focus;
      });
    }

    // Filter by manager
    if (options.reportsTo) {
      agents = agents.filter((a) => a.reportsTo === options.reportsTo);
    }

    // Filter by has session
    if (options.hasSession) {
      agents = agents.filter((a) => {
        const meta = getAgentMeta(a);
        return meta.sessionId !== undefined;
      });
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(agents);
    }

    if (mode === 'quiet') {
      return success(agents.map((a) => a.id).join('\n'));
    }

    if (agents.length === 0) {
      return success(null, t('agent.list.noAgents'));
    }

    const headers = ['ID', 'NAME', 'ROLE', 'STATUS', 'SESSION'];
    const rows = agents.map((agent) => {
      const meta = getAgentMeta(agent);
      return [
        agent.id,
        agent.name ?? '-',
        (meta.agentRole as string) ?? '-',
        (meta.sessionStatus as string) ?? 'idle',
        (meta.sessionId as string)?.slice(0, 8) ?? '-',
      ];
    });

    const table = formatter.table(headers, rows);
    return success(agents, `${table}\n${t('agent.list.agentCount', { count: agents.length })}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('agent.list.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const agentListCommand: Command = {
  name: 'list',
  description: t('agent.list.description'),
  usage: 'sf agent list [options]',
  help: t('agent.list.help'),
  options: agentListOptions,
  handler: agentListHandler as Command['handler'],
};

// ============================================================================
// Agent Show Command
// ============================================================================

async function agentShowHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('agent.show.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    const agent = await api.getAgent(id as EntityId);
    if (!agent) {
      return failure(t('agent.show.notFound', { id }), ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(agent);
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    const meta = getAgentMeta(agent);
    const lines = [
      `ID:       ${agent.id}`,
      `Name:     ${agent.name ?? '-'}`,
      `Role:     ${meta.agentRole ?? '-'}`,
      `Status:   ${meta.sessionStatus ?? 'idle'}`,
      `Session:  ${meta.sessionId ?? '-'}`,
      `Channel:  ${meta.channelId ?? '-'}`,
      `Created:  ${agent.createdAt}`,
    ];

    if (meta.agentRole === 'director') {
      lines.push(`Target Branch: ${meta.targetBranch ?? '(auto-detect)'}`);
    }
    if (meta.workerMode) {
      lines.push(`Mode:     ${meta.workerMode}`);
    }
    if (meta.stewardFocus) {
      lines.push(`Focus:    ${meta.stewardFocus}`);
    }

    return success(agent, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('agent.show.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const agentShowCommand: Command = {
  name: 'show',
  description: t('agent.show.description'),
  usage: 'sf agent show <id>',
  help: t('agent.show.help'),
  options: [],
  handler: agentShowHandler as Command['handler'],
};

// ============================================================================
// Agent Register Command
// ============================================================================

interface AgentRegisterOptions {
  role?: string;
  mode?: string;
  focus?: string;
  maxTasks?: string;
  tags?: string;
  reportsTo?: string;
  roleDef?: string;
  trigger?: string;
  provider?: string;
  model?: string;
  targetBranch?: string;
}

const agentRegisterOptions: CommandOption[] = [
  {
    name: 'role',
    short: 'r',
    description: t('agent.register.option.role'),
    hasValue: true,
    required: true,
  },
  {
    name: 'mode',
    short: 'm',
    description: t('agent.register.option.mode'),
    hasValue: true,
  },
  {
    name: 'focus',
    short: 'f',
    description: t('agent.register.option.focus'),
    hasValue: true,
  },
  {
    name: 'maxTasks',
    short: 't',
    description: t('agent.register.option.maxTasks'),
    hasValue: true,
  },
  {
    name: 'tags',
    description: t('agent.register.option.tags'),
    hasValue: true,
  },
  {
    name: 'reportsTo',
    description: t('agent.register.option.reportsTo'),
    hasValue: true,
  },
  {
    name: 'roleDef',
    description: t('agent.register.option.roleDef'),
    hasValue: true,
  },
  {
    name: 'trigger',
    description: t('agent.register.option.trigger'),
    hasValue: true,
  },
  {
    name: 'provider',
    description: t('agent.register.option.provider'),
    hasValue: true,
  },
  {
    name: 'model',
    description: t('agent.register.option.model'),
    hasValue: true,
  },
  {
    name: 'targetBranch',
    description: t('agent.register.option.targetBranch'),
    hasValue: true,
  },
];

async function agentRegisterHandler(
  args: string[],
  options: GlobalOptions & AgentRegisterOptions
): Promise<CommandResult> {
  const [name] = args;

  if (!name) {
    return failure(t('agent.register.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  if (!options.role) {
    return failure(t('agent.register.roleRequired'), ExitCode.INVALID_ARGUMENTS);
  }

  const validRoles = ['director', 'worker', 'steward'];
  if (!validRoles.includes(options.role)) {
    return failure(
      t('agent.register.invalidRole', { role: options.role, validRoles: validRoles.join(', ') }),
      ExitCode.VALIDATION
    );
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    // Use the default operator entity for CLI operations
    const createdBy = (options.actor ?? OPERATOR_ENTITY_ID) as EntityId;
    const maxConcurrentTasks = options.maxTasks ? parseInt(options.maxTasks, 10) : 1;
    const tags = options.tags ? options.tags.split(',').map(t => t.trim()) : undefined;
    const reportsTo = options.reportsTo as EntityId | undefined;
    const roleDefinitionRef = options.roleDef as ElementId | undefined;

    let agent: AgentEntity;

    switch (options.role as AgentRole) {
      case 'director':
        agent = await api.registerDirector({
          name,
          createdBy,
          maxConcurrentTasks,
          tags,
          roleDefinitionRef,
          provider: options.provider,
          model: options.model,
          targetBranch: options.targetBranch,
        });
        break;

      case 'worker': {
        const workerMode = (options.mode as WorkerMode) ?? 'ephemeral';
        const validModes = ['ephemeral', 'persistent'];
        if (!validModes.includes(workerMode)) {
          return failure(
            t('agent.register.invalidMode', { mode: workerMode, validModes: validModes.join(', ') }),
            ExitCode.VALIDATION
          );
        }
        agent = await api.registerWorker({
          name,
          createdBy,
          workerMode,
          maxConcurrentTasks,
          tags,
          reportsTo,
          roleDefinitionRef,
          provider: options.provider,
          model: options.model,
        });
        break;
      }

      case 'steward': {
        const stewardFocus = (options.focus as StewardFocus) ?? 'merge';
        const validFocuses = ['merge', 'docs', 'recovery', 'custom'];
        if (!validFocuses.includes(stewardFocus)) {
          return failure(
            t('agent.register.invalidFocus', { focus: stewardFocus, validFocuses: validFocuses.join(', ') }),
            ExitCode.VALIDATION
          );
        }
        // Parse trigger if provided
        const triggers: Array<{ type: 'cron'; schedule: string }> = [];
        if (options.trigger) {
          triggers.push({ type: 'cron', schedule: options.trigger });
        }
        agent = await api.registerSteward({
          name,
          createdBy,
          stewardFocus,
          triggers,
          maxConcurrentTasks,
          tags,
          reportsTo,
          roleDefinitionRef,
          provider: options.provider,
          model: options.model,
        });
        break;
      }

      default:
        return failure(t('agent.register.unknownRole', { role: options.role }), ExitCode.VALIDATION);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(agent);
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    return success(agent, t('agent.register.success', { role: options.role, id: agent.id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('agent.register.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const agentRegisterCommand: Command = {
  name: 'register',
  description: t('agent.register.description'),
  usage: 'sf agent register <name> --role <role> [options]',
  help: t('agent.register.help'),
  options: agentRegisterOptions,
  handler: agentRegisterHandler as Command['handler'],
};

// ============================================================================
// Agent Stop Command
// ============================================================================

interface AgentStopOptions {
  graceful?: boolean;
  reason?: string;
}

const agentStopOptions: CommandOption[] = [
  {
    name: 'graceful',
    short: 'g',
    description: t('agent.stop.option.graceful'),
  },
  {
    name: 'no-graceful',
    description: t('agent.stop.option.noGraceful'),
  },
  {
    name: 'reason',
    short: 'r',
    description: t('agent.stop.option.reason'),
    hasValue: true,
  },
];

async function agentStopHandler(
  args: string[],
  options: GlobalOptions & AgentStopOptions & { 'no-graceful'?: boolean }
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('agent.stop.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    // Determine graceful mode (default true unless --no-graceful is set)
    const graceful = options['no-graceful'] !== true;

    const agent = await api.updateAgentSession(
      id as EntityId,
      undefined,
      'idle'
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        ...agent,
        graceful,
        reason: options.reason,
      });
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    let message = t('agent.stop.success', { id });
    if (!graceful) {
      message = t('agent.stop.forced', { id });
    }
    if (options.reason) {
      message = t('agent.stop.withReason', { id, reason: options.reason });
    }

    return success(agent, message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('agent.stop.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const agentStopCommand: Command = {
  name: 'stop',
  description: t('agent.stop.description'),
  usage: 'sf agent stop <id> [options]',
  help: t('agent.stop.help'),
  options: agentStopOptions,
  handler: agentStopHandler as Command['handler'],
};

// ============================================================================
// Agent Stream Command
// ============================================================================

async function agentStreamHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('agent.stream.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    const channelId = await api.getAgentChannel(id as EntityId);
    if (!channelId) {
      return failure(t('agent.stream.noChannel', { id }), ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ channelId, agentId: id });
    }

    return success(
      { channelId },
      t('agent.stream.channelInfo', { id, channelId })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('agent.stream.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const agentStreamCommand: Command = {
  name: 'stream',
  description: t('agent.stream.description'),
  usage: 'sf agent stream <id>',
  help: t('agent.stream.help'),
  options: [],
  handler: agentStreamHandler as Command['handler'],
};

// ============================================================================
// Agent Start Command
// ============================================================================

interface AgentStartOptions {
  prompt?: string;
  mode?: string;
  resume?: string;
  workdir?: string;
  cols?: string;
  rows?: string;
  timeout?: string;
  env?: string;
  taskId?: string;
  stream?: boolean;
  provider?: string;
  model?: string;
}

const agentStartOptions: CommandOption[] = [
  {
    name: 'prompt',
    short: 'p',
    description: t('agent.start.option.prompt'),
    hasValue: true,
  },
  {
    name: 'mode',
    short: 'm',
    description: t('agent.start.option.mode'),
    hasValue: true,
  },
  {
    name: 'resume',
    short: 'r',
    description: t('agent.start.option.resume'),
    hasValue: true,
  },
  {
    name: 'workdir',
    short: 'w',
    description: t('agent.start.option.workdir'),
    hasValue: true,
  },
  {
    name: 'cols',
    description: t('agent.start.option.cols'),
    hasValue: true,
  },
  {
    name: 'rows',
    description: t('agent.start.option.rows'),
    hasValue: true,
  },
  {
    name: 'timeout',
    description: t('agent.start.option.timeout'),
    hasValue: true,
  },
  {
    name: 'env',
    short: 'e',
    description: t('agent.start.option.env'),
    hasValue: true,
  },
  {
    name: 'taskId',
    short: 't',
    description: t('agent.start.option.taskId'),
    hasValue: true,
  },
  {
    name: 'stream',
    description: t('agent.start.option.stream'),
  },
  {
    name: 'provider',
    description: t('agent.start.option.provider'),
    hasValue: true,
  },
  {
    name: 'model',
    description: t('agent.start.option.model'),
    hasValue: true,
  },
];

async function agentStartHandler(
  args: string[],
  options: GlobalOptions & AgentStartOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(t('agent.start.usageError'), ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? t('shared.failedToCreateApi'), ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the agent to verify it exists and get its role
    const agent = await api.getAgent(id as EntityId);
    if (!agent) {
      return failure(t('agent.start.notFound', { id }), ExitCode.NOT_FOUND);
    }

    const meta = getAgentMeta(agent);
    const agentRole = (meta.agentRole as AgentRole) ?? 'worker';

    // Import the spawner service
    const { createSpawnerService } = await import('../../runtime/index.js');
    const { findStoneforgeDir } = await import('@stoneforge/quarry');

    // Parse environment variables
    const environmentVariables: Record<string, string> = {};
    if (options.env) {
      const parts = options.env.split('=');
      if (parts.length >= 2) {
        const key = parts[0];
        const value = parts.slice(1).join('=');
        environmentVariables[key] = value;
      }
    }

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    const spawner = createSpawnerService({
      workingDirectory: options.workdir ?? process.cwd(),
      stoneforgeRoot: stoneforgeDir ?? undefined,
      timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      environmentVariables: Object.keys(environmentVariables).length > 0 ? environmentVariables : undefined,
    });

    // Determine spawn mode
    let spawnMode: 'headless' | 'interactive' | undefined;
    if (options.mode) {
      if (options.mode !== 'headless' && options.mode !== 'interactive') {
        return failure(
          t('agent.start.invalidMode', { mode: options.mode }),
          ExitCode.VALIDATION
        );
      }
      spawnMode = options.mode as 'headless' | 'interactive';
    }

    // Spawn the agent
    const result = await spawner.spawn(id as EntityId, agentRole, {
      initialPrompt: options.prompt,
      mode: spawnMode,
      resumeSessionId: options.resume,
      workingDirectory: options.workdir,
      cols: options.cols ? parseInt(options.cols, 10) : undefined,
      rows: options.rows ? parseInt(options.rows, 10) : undefined,
    });

    // If task ID is provided, assign the task to this agent
    if (options.taskId) {
      await api.assignTaskToAgent(
        options.taskId as ElementId,
        id as EntityId,
        { sessionId: result.session.id }
      );
    }

    // If --stream is set, stream the session output
    if (options.stream) {
      console.log(t('agent.start.spawned', { id }));
      console.log(`  Session ID:  ${result.session.id}`);
      console.log(`  Mode:        ${result.session.mode}`);
      console.log('\n' + t('agent.start.streaming') + '\n');

      await streamSpawnedSession(result.events, result.session.mode);

      return success(result.session, t('agent.start.streamEnded'));
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        sessionId: result.session.id,
        providerSessionId: result.session.providerSessionId,
        agentId: id,
        status: result.session.status,
        mode: result.session.mode,
        pid: result.session.pid,
        taskId: options.taskId,
      });
    }

    if (mode === 'quiet') {
      return success(result.session.id);
    }

    const lines = [
      `Spawned agent ${id}`,
      `  Session ID:  ${result.session.id}`,
      `  Provider ID: ${result.session.providerSessionId ?? '-'}`,
      `  Status:      ${result.session.status}`,
      `  Mode:        ${result.session.mode}`,
      `  PID:         ${result.session.pid ?? '-'}`,
    ];
    if (options.taskId) {
      lines.push(`  Task ID:     ${options.taskId}`);
    }

    return success(result.session, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('agent.start.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const agentStartCommand: Command = {
  name: 'start',
  description: t('agent.start.description'),
  usage: 'sf agent start <id> [options]',
  help: t('agent.start.help'),
  options: agentStartOptions,
  handler: agentStartHandler as Command['handler'],
};

// ============================================================================
// Main Agent Command
// ============================================================================

export const agentCommand: Command = {
  name: 'agent',
  description: t('agent.description'),
  usage: 'sf agent <subcommand> [options]',
  help: t('agent.help'),
  subcommands: {
    list: agentListCommand,
    show: agentShowCommand,
    register: agentRegisterCommand,
    start: agentStartCommand,
    stop: agentStopCommand,
    stream: agentStreamCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    create: agentRegisterCommand,
    ls: agentListCommand,
    get: agentShowCommand,
    view: agentShowCommand,
  },
  handler: agentListCommand.handler, // Default to list
  options: [],
};
