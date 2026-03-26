/**
 * serve command - Start a Stoneforge server
 *
 * Usage:
 *   sf serve           - Start smithy (if installed) or quarry
 *   sf serve quarry    - Start the quarry server
 *   sf serve smithy    - Start the smithy server
 */

import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { failure, ExitCode } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// ANSI Helpers (TTY-aware, consistent with sf init branding)
// ============================================================================

function createColors() {
  const isTTY = process.stdout.isTTY;
  return {
    bold: isTTY ? '\x1b[1m' : '',
    dim: isTTY ? '\x1b[2m' : '',
    green: isTTY ? '\x1b[32m' : '',
    cyan: isTTY ? '\x1b[36m' : '',
    yellow: isTTY ? '\x1b[33m' : '',
    reset: isTTY ? '\x1b[0m' : '',
  };
}

// ============================================================================
// Console Output Suppression
// ============================================================================

interface CapturedConsole {
  logs: string[];
  restore: () => void;
}

/**
 * Temporarily intercept console.log, console.debug, and console.warn
 * to suppress noisy startup output. Captured messages are stored for
 * verbose mode or debugging.
 */
function suppressConsole(): CapturedConsole {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalDebug = console.debug;
  const originalWarn = console.warn;

  const capture = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  console.log = capture;
  console.debug = capture;
  console.warn = capture;

  return {
    logs,
    restore() {
      console.log = originalLog;
      console.debug = originalDebug;
      console.warn = originalWarn;
    },
  };
}

// ============================================================================
// Branded Output
// ============================================================================

interface ServerSummary {
  url: string;
  agentCount?: number;
  daemonStatus?: string;
  mode: 'smithy' | 'quarry';
}

function printBrandedSummary(summary: ServerSummary): void {
  const c = createColors();
  const lines: string[] = [];

  // Branding
  lines.push('');
  lines.push(`  ${c.cyan}⛏  Stoneforge${c.reset}`);
  lines.push('');

  // Success indicator
  lines.push(`  ${c.green}✔${c.reset} ${c.bold}Server ready${c.reset}`);
  lines.push('');

  // Key-value summary
  const labelWidth = 14;
  const pad = (label: string) => `  ${c.dim}${label.padEnd(labelWidth)}${c.reset}`;

  lines.push(`${pad('Dashboard')}${c.cyan}${summary.url}${c.reset}`);

  if (summary.agentCount !== undefined) {
    lines.push(`${pad('Agents')}${summary.agentCount} loaded`);
  }

  if (summary.daemonStatus) {
    const statusText = formatDaemonStatus(summary.daemonStatus, c);
    lines.push(`${pad('Daemon')}${statusText}`);
  }

  lines.push('');
  lines.push(`  ${c.dim}Press Ctrl+C to stop${c.reset}`);
  lines.push('');

  console.log(lines.join('\n'));
}

function formatDaemonStatus(
  status: string,
  c: ReturnType<typeof createColors>,
): string {
  switch (status) {
    case 'running':
      return `${c.green}running${c.reset}`;
    case 'no-git':
      return `${c.dim}disabled (no git repository)${c.reset}`;
    case 'disabled':
      return `${c.dim}disabled (DAEMON_AUTO_START=false)${c.reset}`;
    case 'stopped-by-user':
      return `${c.dim}stopped (by user)${c.reset}`;
    default:
      return `${c.dim}${status}${c.reset}`;
  }
}

// ============================================================================
// Web Root Helpers
// ============================================================================

function quarryWebRoot(): string | undefined {
  const webRoot = resolve(__dirname, '../../../web');
  return existsSync(webRoot) ? webRoot : undefined;
}

/**
 * Pre-registered smithy loader set by packages/smithy/src/bin/sf.ts.
 * This bypasses module resolution issues under pnpm's strict isolation,
 * where quarry cannot resolve @stoneforge/smithy at runtime.
 */
interface SmithyRegistration {
  loadServer: () => Promise<{ startSmithyServer: (opts: Record<string, unknown>) => Promise<unknown> }>;
  webRoot: string;
}

function getSmithyRegistration(): SmithyRegistration | undefined {
  return (globalThis as Record<string, unknown>).__stoneforge_smithy as SmithyRegistration | undefined;
}

function smithyWebRoot(): string | undefined {
  // Check pre-registered path from smithy's sf.js entry point
  const reg = getSmithyRegistration();
  if (reg && existsSync(reg.webRoot)) return reg.webRoot;

  try {
    // import.meta.resolve returns a file:// URL for the smithy package entry
    const smithyUrl = import.meta.resolve('@stoneforge/smithy');
    const smithyPath = fileURLToPath(smithyUrl);
    // From smithy's entry (dist/index.js or src/index.ts), go up to package root + /web
    const webRoot = resolve(dirname(smithyPath), '../web');
    if (existsSync(webRoot)) return webRoot;
    // Try one more level up (for src/index.ts → ../../web)
    const webRoot2 = resolve(dirname(smithyPath), '../../web');
    if (existsSync(webRoot2)) return webRoot2;
  } catch {
    // smithy not installed and not pre-registered
  }
  return undefined;
}

// ============================================================================
// Browser Opener
// ============================================================================

/**
 * Open a URL in the user's default browser.
 * Fire-and-forget — failures are logged but never crash the server.
 */
function openInBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      const c = createColors();
      console.log(`  ${c.dim}Could not open browser automatically. Visit ${url}${c.reset}`);
    }
  });
}

// ============================================================================
// Server Starters
// ============================================================================

async function startQuarry(options: GlobalOptions): Promise<CommandResult> {
  const isVerbose = options.verbose;
  const isQuiet = options.quiet;

  // Suppress noisy startup output unless --verbose
  let captured: CapturedConsole | undefined;
  if (!isVerbose) {
    captured = suppressConsole();
  }

  const { startQuarryServer } = await import('../../server/index.js');

  const port = options.port ? parseInt(String(options.port), 10) : 3456;
  const host = options.host ? String(options.host) : 'localhost';

  startQuarryServer({
    port,
    host,
    dbPath: options.db ? String(options.db) : undefined,
    webRoot: quarryWebRoot(),
  });

  // Restore console before printing summary
  if (captured) {
    captured.restore();
  }

  const quarryUrl = `http://${host}:${port}`;

  if (isVerbose && captured) {
    // Print all captured logs in verbose mode
    for (const log of captured.logs) {
      console.log(log);
    }
  }

  if (!isQuiet) {
    printBrandedSummary({
      url: quarryUrl,
      mode: 'quarry',
    });
  }

  if (!options['no-open']) {
    openInBrowser(quarryUrl);
  }
  return await new Promise<never>(() => {});
}

async function startSmithy(options: GlobalOptions): Promise<CommandResult> {
  const isVerbose = options.verbose;
  const isQuiet = options.quiet;

  let startSmithyServer: (opts: Record<string, unknown>) => Promise<unknown>;

  // Try pre-registered loader first (set by smithy's sf.js entry point),
  // then fall back to dynamic import for standalone quarry installs.
  const reg = getSmithyRegistration();
  if (reg) {
    const mod = await reg.loadServer();
    startSmithyServer = mod.startSmithyServer;
  } else {
    try {
      // @ts-ignore — smithy is an optional runtime dependency, may not be installed
      const mod = await import('@stoneforge/smithy/server');
      startSmithyServer = mod.startSmithyServer;
    } catch {
      return failure(
        'Smithy is not installed. Install @stoneforge/smithy to use `sf serve smithy`.',
        ExitCode.GENERAL_ERROR
      );
    }
  }

  const port = options.port ? parseInt(String(options.port), 10) : 3457;
  const host = options.host ? String(options.host) : 'localhost';

  // Suppress noisy startup output unless --verbose
  // Set LOG_LEVEL to WARNING to suppress logger-based INFO messages
  let captured: CapturedConsole | undefined;
  const previousLogLevel = process.env.LOG_LEVEL;
  if (!isVerbose) {
    if (!previousLogLevel) {
      process.env.LOG_LEVEL = 'WARNING';
    }
    captured = suppressConsole();
  }

  const result = await startSmithyServer({
    port,
    host,
    dbPath: options.db ? String(options.db) : undefined,
    webRoot: smithyWebRoot(),
  });

  // Restore console and log level
  if (captured) {
    captured.restore();
  }
  if (!isVerbose && !previousLogLevel) {
    // Restore to INFO so runtime logs work normally after startup
    process.env.LOG_LEVEL = 'INFO';
  }

  // Extract structured info from result
  const actualPort = (result && typeof result === 'object' && 'port' in result) ? (result as { port: number }).port : port;
  const agentCount = (result && typeof result === 'object' && 'agentCount' in result) ? (result as { agentCount: number }).agentCount : undefined;
  const daemonStatus = (result && typeof result === 'object' && 'daemonStatus' in result) ? (result as { daemonStatus: string }).daemonStatus : undefined;

  const smithyUrl = `http://${host}:${actualPort}`;

  if (isVerbose && captured) {
    // Print all captured logs in verbose mode
    for (const log of captured.logs) {
      console.log(log);
    }
  }

  if (!isQuiet) {
    printBrandedSummary({
      url: smithyUrl,
      agentCount,
      daemonStatus,
      mode: 'smithy',
    });
  }

  if (!options['no-open']) {
    openInBrowser(smithyUrl);
  }
  return await new Promise<never>(() => {});
}

// ============================================================================
// Command Definition
// ============================================================================

export const serveCommand: Command = {
  name: 'serve',
  description: 'Start a Stoneforge server (smithy, quarry)',
  usage: 'sf serve [quarry|smithy] [options]',
  options: [
    { name: 'port', short: 'p', description: 'Port to listen on', hasValue: true },
    { name: 'host', short: 'H', description: 'Host to bind to', hasValue: true, defaultValue: 'localhost' },
    { name: 'no-open', description: 'Do not open browser automatically', hasValue: false },
  ],
  handler: async (args: string[], options: GlobalOptions): Promise<CommandResult> => {
    const target = args[0];

    try {
      if (target === 'quarry') {
        return await startQuarry(options);
      }

      if (target === 'smithy') {
        return await startSmithy(options);
      }

      if (target) {
        return failure(
          `Unknown server target: ${target}. Use 'quarry' or 'smithy'.`,
          ExitCode.INVALID_ARGUMENTS
        );
      }

      // No target specified — try smithy first, fall back to quarry
      if (getSmithyRegistration()) {
        return await startSmithy(options);
      }
      try {
        // @ts-ignore — smithy is an optional runtime dependency, may not be installed
        await import('@stoneforge/smithy/server');
        return await startSmithy(options);
      } catch {
        return await startQuarry(options);
      }
    } catch (error) {
      return failure(
        `Failed to start server: ${error instanceof Error ? error.message : String(error)}`,
        ExitCode.GENERAL_ERROR
      );
    }
  },
};
