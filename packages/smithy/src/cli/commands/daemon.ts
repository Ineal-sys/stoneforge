/**
 * Daemon Commands - CLI operations for the dispatch daemon
 *
 * Provides commands for daemon management:
 * - daemon start: Start the dispatch daemon
 * - daemon stop: Stop the dispatch daemon
 * - daemon status: Show daemon status (including rate limit info)
 * - daemon sleep: Pause dispatch until a specified time
 * - daemon wake: Immediately resume dispatch
 */

import * as readline from 'node:readline';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getOutputMode } from '@stoneforge/quarry/cli';
import { t } from '../i18n/index.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SERVER_URL = 'http://localhost:3457';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Gets the server URL from options or default
 */
function getServerUrl(options: DaemonOptions): string {
  return options.server ?? DEFAULT_SERVER_URL;
}

/**
 * Makes a request to the orchestrator server
 */
async function serverRequest(
  url: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error ?? `Server returned ${response.status}`,
      };
    }

    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return {
        ok: false,
        error: t('daemon.connectFailed'),
      };
    }
    return { ok: false, error: message };
  }
}

/**
 * Prompts user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// ============================================================================
// Common Options
// ============================================================================

interface DaemonOptions {
  server?: string;
}

const daemonOptions: CommandOption[] = [
  {
    name: 'server',
    short: 's',
    description: t('daemon.option.server', { url: DEFAULT_SERVER_URL }),
    hasValue: true,
  },
];

// ============================================================================
// Daemon Start Command
// ============================================================================

async function daemonStartHandler(
  _args: string[],
  options: GlobalOptions & DaemonOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);
  const url = `${serverUrl}/api/daemon/start`;

  const result = await serverRequest(url, 'POST');

  if (!result.ok) {
    return failure(t('daemon.start.failed', { error: result.error }), ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as { status?: string; message?: string };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success(data.status ?? 'started');
  }

  return success(data, data.message ?? t('daemon.start.started'));
}

export const daemonStartCommand: Command = {
  name: 'start',
  description: t('daemon.start.description'),
  usage: 'sf daemon start [options]',
  help: t('daemon.start.help'),
  options: daemonOptions,
  handler: daemonStartHandler as Command['handler'],
};

// ============================================================================
// Daemon Stop Command
// ============================================================================

interface DaemonStopOptions extends DaemonOptions {
  force?: boolean;
}

const daemonStopOptions: CommandOption[] = [
  ...daemonOptions,
  {
    name: 'force',
    short: 'f',
    description: t('daemon.stop.option.force'),
  },
];

async function daemonStopHandler(
  _args: string[],
  options: GlobalOptions & DaemonStopOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);

  // First check the daemon status
  const statusUrl = `${serverUrl}/api/daemon/status`;
  const statusResult = await serverRequest(statusUrl, 'GET');

  if (!statusResult.ok) {
    return failure(t('daemon.stop.statusCheckFailed', { error: statusResult.error }), ExitCode.GENERAL_ERROR);
  }

  const statusData = statusResult.data as { running?: boolean; status?: string };

  // If daemon is not running, nothing to stop
  if (!statusData.running && statusData.status !== 'running') {
    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ status: 'not_running', message: t('daemon.stop.notRunning') });
    }
    return success(null, t('daemon.stop.notRunning'));
  }

  // Confirm before stopping unless --force is set
  if (!options.force) {
    const confirmed = await confirm(t('daemon.stop.confirm'));
    if (!confirmed) {
      return success(null, t('daemon.stop.cancelled'));
    }
  }

  // Stop the daemon
  const stopUrl = `${serverUrl}/api/daemon/stop`;
  const result = await serverRequest(stopUrl, 'POST');

  if (!result.ok) {
    return failure(t('daemon.stop.failed', { error: result.error }), ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as { status?: string; message?: string };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success(data.status ?? 'stopped');
  }

  return success(data, data.message ?? t('daemon.stop.stopped'));
}

export const daemonStopCommand: Command = {
  name: 'stop',
  description: t('daemon.stop.description'),
  usage: 'sf daemon stop [options]',
  help: t('daemon.stop.help'),
  options: daemonStopOptions,
  handler: daemonStopHandler as Command['handler'],
};

// ============================================================================
// Daemon Status Command
// ============================================================================

async function daemonStatusHandler(
  _args: string[],
  options: GlobalOptions & DaemonOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);
  const url = `${serverUrl}/api/daemon/status`;

  const result = await serverRequest(url, 'GET');

  if (!result.ok) {
    return failure(t('daemon.status.failed', { error: result.error }), ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as {
    status?: string;
    isRunning?: boolean;
    running?: boolean;
    uptime?: number;
    tasksDispatched?: number;
    lastDispatchAt?: string;
    rateLimit?: {
      isPaused: boolean;
      limits: Array<{ executable: string; resetsAt: string }>;
      soonestReset?: string;
    };
  };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success(data.status ?? ((data.isRunning ?? data.running) ? 'running' : 'stopped'));
  }

  // Human-readable output
  const lines: string[] = [];
  const isRunning = data.isRunning ?? data.running ?? data.status === 'running';

  lines.push(`${t('daemon.status.labelStatus')}:    ${isRunning ? 'running' : 'stopped'}`);

  if (data.uptime !== undefined) {
    const uptimeSeconds = Math.floor(data.uptime / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    lines.push(`${t('daemon.status.labelUptime')}:    ${hours}h ${minutes}m ${seconds}s`);
  }

  if (data.tasksDispatched !== undefined) {
    lines.push(`${t('daemon.status.labelDispatched')}: ${t('daemon.status.taskCount', { count: data.tasksDispatched })}`);
  }

  if (data.lastDispatchAt) {
    lines.push(`${t('daemon.status.labelLastDispatch')}: ${data.lastDispatchAt}`);
  }

  // Rate limit / sleep status
  if (data.rateLimit) {
    const rl = data.rateLimit;
    lines.push('');
    lines.push(`${t('daemon.status.labelDispatch')}:  ${rl.isPaused ? '⏸ ' + t('daemon.status.pausedRateLimited') : '▶ ' + t('daemon.status.active')}`);

    if (rl.limits.length > 0) {
      lines.push(t('daemon.status.rateLimitedExecutables'));
      for (const limit of rl.limits) {
        const resetDate = new Date(limit.resetsAt);
        lines.push(`  - ${limit.executable}: ${t('daemon.status.resets', { time: formatRelativeTime(resetDate) })}`);
      }
    }

    if (rl.soonestReset) {
      const soonest = new Date(rl.soonestReset);
      lines.push(`${t('daemon.status.soonestReset')}: ${formatRelativeTime(soonest)}`);
    }
  }

  return success(data, lines.join('\n'));
}

/**
 * Formats a date as a human-readable relative time string.
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = date.getTime() - now;

  if (diff <= 0) {
    return t('daemon.status.nowExpired');
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (hours === 0 && minutes < 5) parts.push(`${seconds % 60}s`);

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return t('daemon.status.inTime', { time: timeStr, relative: parts.join(' ') });
}

export const daemonStatusCommand: Command = {
  name: 'status',
  description: t('daemon.status.description'),
  usage: 'sf daemon status [options]',
  help: t('daemon.status.help'),
  options: daemonOptions,
  handler: daemonStatusHandler as Command['handler'],
};

// ============================================================================
// Daemon Sleep Command
// ============================================================================

interface DaemonSleepOptions extends DaemonOptions {
  until?: string;
  duration?: string;
}

const daemonSleepOptions: CommandOption[] = [
  ...daemonOptions,
  {
    name: 'until',
    short: 'u',
    description: t('daemon.sleep.option.until'),
    hasValue: true,
  },
  {
    name: 'duration',
    short: 'd',
    description: t('daemon.sleep.option.duration'),
    hasValue: true,
  },
];

async function daemonSleepHandler(
  _args: string[],
  options: GlobalOptions & DaemonSleepOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);
  const url = `${serverUrl}/api/daemon/sleep`;

  if (!options.until && !options.duration) {
    return failure(
      t('daemon.sleep.requireUntilOrDuration'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (options.until && options.duration) {
    return failure(
      t('daemon.sleep.exclusiveOptions'),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const body: { until?: string; duration?: number } = {};

  if (options.until) {
    body.until = String(options.until);
  } else if (options.duration) {
    const duration = Number(options.duration);
    if (isNaN(duration) || duration <= 0) {
      return failure(t('daemon.sleep.invalidDuration'), ExitCode.INVALID_ARGUMENTS);
    }
    body.duration = duration;
  }

  const result = await serverRequest(url, 'POST', body);

  if (!result.ok) {
    return failure(t('daemon.sleep.failed', { error: result.error }), ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as { sleepUntil?: string; message?: string };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success(data.sleepUntil ?? 'sleeping');
  }

  const sleepUntilDate = data.sleepUntil ? new Date(data.sleepUntil) : undefined;
  const message = sleepUntilDate
    ? t('daemon.sleep.pausedUntil', { time: sleepUntilDate.toLocaleString() })
    : (data.message ?? t('daemon.sleep.paused'));

  return success(data, message);
}

export const daemonSleepCommand: Command = {
  name: 'sleep',
  description: t('daemon.sleep.description'),
  usage: 'sf daemon sleep [options]',
  help: t('daemon.sleep.help'),
  options: daemonSleepOptions,
  handler: daemonSleepHandler as Command['handler'],
};

// ============================================================================
// Daemon Wake Command
// ============================================================================

async function daemonWakeHandler(
  _args: string[],
  options: GlobalOptions & DaemonOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);
  const url = `${serverUrl}/api/daemon/wake`;

  const result = await serverRequest(url, 'POST');

  if (!result.ok) {
    return failure(t('daemon.wake.failed', { error: result.error }), ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as { message?: string };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success('awake');
  }

  return success(data, data.message ?? t('daemon.wake.resumed'));
}

export const daemonWakeCommand: Command = {
  name: 'wake',
  description: t('daemon.wake.description'),
  usage: 'sf daemon wake [options]',
  help: t('daemon.wake.help'),
  options: daemonOptions,
  handler: daemonWakeHandler as Command['handler'],
};

// ============================================================================
// Main Daemon Command
// ============================================================================

export const daemonCommand: Command = {
  name: 'daemon',
  description: t('daemon.description'),
  usage: 'sf daemon <subcommand> [options]',
  help: t('daemon.help'),
  subcommands: {
    start: daemonStartCommand,
    stop: daemonStopCommand,
    status: daemonStatusCommand,
    sleep: daemonSleepCommand,
    wake: daemonWakeCommand,
  },
  handler: daemonStatusHandler as Command['handler'], // Default to status
  options: daemonOptions,
};
