/**
 * Test Orchestration Command - CLI operations for running E2E orchestration tests
 *
 * Provides commands for running the orchestration test suite:
 * - test-orchestration: Run all tests
 * - test-orchestration --test <id>: Run specific test
 * - test-orchestration --mode real: Run with real Claude processes
 * - test-orchestration --tag worker: Run tests by tag
 * - test-orchestration --bail: Stop on first failure
 * - test-orchestration --verbose: Verbose output
 */

import type { Command, GlobalOptions, CommandResult } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode } from '@stoneforge/quarry/cli';
import type { TestContext } from '../../testing/test-context.js';
import type { OrchestrationTest } from '../../testing/orchestration-tests.js';
import { t } from '../i18n/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestOrchestrationOptions {
  /** Filter tests by ID (substring match) */
  test?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Timeout for each test in milliseconds */
  timeout?: number;
  /** Skip cleanup on failure (for debugging) */
  skipCleanup?: boolean;
  /** Test mode: 'mock' (default) or 'real' (spawns Claude processes) */
  mode?: 'mock' | 'real';
  /** Stop on first failure */
  bail?: boolean;
  /** Filter tests by tag */
  tag?: string;
}

interface TestRunResult {
  passed: boolean;
  message: string;
  duration: number;
  details?: Record<string, unknown>;
}

// Default timeouts by test tag for real mode (in ms)
const REAL_MODE_TIMEOUTS: Record<string, number> = {
  director: 240000,
  daemon: 180000,
  worker: 300000,
  steward: 300000,
};

const DEFAULT_REAL_TIMEOUT = 300000;

// ============================================================================
// Test Runner
// ============================================================================

async function runOrchestrationTests(options: TestOrchestrationOptions): Promise<CommandResult> {
  const { setupTestContext } = await import('../../testing/test-context.js');
  const { allTests, getTestsByTag } = await import('../../testing/orchestration-tests.js');

  const mode = options.mode ?? 'mock';

  console.log('🧪 ' + t('testOrchestration.title') + '\n');
  console.log('═'.repeat(60));
  console.log(t('testOrchestration.modeLabel', { mode }));

  // Real mode warning
  if (mode === 'real') {
    console.log('');
    console.log('  ⚠  ' + t('testOrchestration.realModeWarning'));
    console.log('  ⚠  ' + t('testOrchestration.realModeEnsureClaude'));
    console.log('  ⚠  ' + t('testOrchestration.realModeLongerTimeouts'));
    console.log('');
  }

  // Setup isolated test environment
  console.log('\n' + t('testOrchestration.creatingWorkspace'));
  let ctx: TestContext | undefined;

  try {
    ctx = await setupTestContext({
      verbose: options.verbose ?? false,
      mode,
    });
    console.log('  ✓ ' + t('testOrchestration.tempWorkspace', { path: ctx.tempWorkspace }));
    console.log('  ✓ ' + t('testOrchestration.gitInitialized'));
    console.log('  ✓ ' + t('testOrchestration.localRemoteCreated'));
    console.log('  ✓ ' + t('testOrchestration.projectStructureCreated'));
    console.log('  ✓ ' + t('testOrchestration.databaseInitialized'));
    if (mode === 'real') {
      console.log('  ✓ ' + t('testOrchestration.realSessionManager'));
      console.log('  ✓ ' + t('testOrchestration.testPromptOverrides'));
    } else {
      console.log('  ✓ ' + t('testOrchestration.mockSessionManager'));
    }
    console.log('\n✓ ' + t('testOrchestration.environmentReady') + '\n');

    // Start daemon
    await ctx.daemon.start();
    console.log('✓ ' + t('testOrchestration.daemonRunning') + '\n');
    console.log('═'.repeat(60));
    console.log('');

    // Get tests to run — filter by --test and --tag
    let tests: OrchestrationTest[] = allTests;

    if (options.tag) {
      tests = getTestsByTag(options.tag);
    }

    if (options.test) {
      tests = tests.filter((test: OrchestrationTest) => test.id.includes(options.test!));
    }

    if (tests.length === 0) {
      const filterDesc = [
        options.test ? `id="${options.test}"` : '',
        options.tag ? `tag="${options.tag}"` : '',
      ].filter(Boolean).join(', ');
      return failure(t('testOrchestration.noMatchingTests', { filter: filterDesc }), ExitCode.GENERAL_ERROR);
    }

    console.log(t('testOrchestration.runningTests', { count: tests.length }) + '\n');

    // Run tests
    const results: TestRunResult[] = [];
    let bailed = false;

    for (const test of tests) {
      console.log(`▶ ${test.name}`);
      if (options.verbose) {
        console.log(`  ${test.description}`);
      }

      const startTime = Date.now();
      try {
        const result = await runSingleTest(test, ctx, options);
        result.duration = Date.now() - startTime;
        results.push(result);

        const icon = result.passed ? '✓' : '✗';
        const color = result.passed ? '\x1b[32m' : '\x1b[31m';
        const reset = '\x1b[0m';
        console.log(`  ${color}${icon}${reset} ${result.message} (${formatDuration(result.duration)})`);

        if (!result.passed && options.verbose && result.details) {
          console.log(t('testOrchestration.testDetails', { details: JSON.stringify(result.details, null, 2) }));
        }
        console.log('');

        // Bail on failure if requested
        if (!result.passed && options.bail) {
          console.log('  ⚠ ' + t('testOrchestration.bailingOnFailure') + '\n');
          bailed = true;

          // In real mode, dump session event logs if available
          if (mode === 'real' && options.verbose) {
            await dumpSessionLogs(ctx);
          }

          break;
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          passed: false,
          message: t('testOrchestration.errorMessage', { message }),
          duration,
        });
        console.log(`  \x1b[31m✗\x1b[0m ` + t('testOrchestration.errorWithDuration', { message, duration: formatDuration(duration) }) + '\n');

        if (options.bail) {
          console.log('  ⚠ ' + t('testOrchestration.bailingOnFailure') + '\n');
          bailed = true;

          if (mode === 'real' && options.verbose) {
            await dumpSessionLogs(ctx);
          }

          break;
        }
      }
    }

    // Summary
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const skipped = tests.length - results.length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log('═'.repeat(60));
    console.log('\n📊 ' + t('testOrchestration.resultsSummary') + '\n');

    if (failed === 0 && !bailed) {
      console.log(`  \x1b[32m✓ ` + t('testOrchestration.allTestsPassed', { count: passed }) + `\x1b[0m`);
    } else {
      console.log(`  \x1b[32m✓ ` + t('testOrchestration.passed', { count: passed }) + `\x1b[0m`);
      console.log(`  \x1b[31m✗ ` + t('testOrchestration.failed', { count: failed }) + `\x1b[0m`);
      if (skipped > 0) {
        console.log(`  ⊘ ` + t('testOrchestration.skipped', { count: skipped }));
      }
    }
    console.log(`  ⏱ ` + t('testOrchestration.totalTime', { time: formatDuration(totalDuration) }));
    console.log('  ' + t('testOrchestration.modeLabel', { mode }));
    console.log('');

    // Cleanup
    if (!options.skipCleanup) {
      console.log(t('testOrchestration.cleaningUp'));
      await ctx.cleanup();
      console.log('  ✓ ' + t('testOrchestration.daemonStopped'));
      console.log('  ✓ ' + t('testOrchestration.tempWorkspaceDeleted'));
      console.log('');
    } else {
      console.log('\n⚠ ' + t('testOrchestration.skippingCleanup', { path: ctx.tempWorkspace }) + '\n');
      await ctx.daemon.stop();
    }

    return passed === results.length ? success() : failure(t('testOrchestration.someTestsFailed'), ExitCode.GENERAL_ERROR);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n\x1b[31m' + t('testOrchestration.fatalError', { message }) + '\x1b[0m\n');

    if (ctx && !options.skipCleanup) {
      try {
        await ctx.cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    return failure(message, ExitCode.GENERAL_ERROR);
  }
}

/**
 * Run a single test with timeout
 */
async function runSingleTest(
  test: OrchestrationTest,
  ctx: TestContext,
  options: TestOrchestrationOptions
): Promise<TestRunResult> {
  // Determine timeout: explicit option > mode-specific default > test default
  let testTimeout: number;
  if (options.timeout) {
    testTimeout = options.timeout;
  } else if (options.mode === 'real') {
    // Use tag-based timeout for real mode
    const tag = test.tags?.find(t => t in REAL_MODE_TIMEOUTS);
    testTimeout = tag ? REAL_MODE_TIMEOUTS[tag] : DEFAULT_REAL_TIMEOUT;
  } else {
    testTimeout = test.timeout;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        passed: false,
        message: t('testOrchestration.testTimedOut', { timeout: String(testTimeout) }),
        duration: testTimeout,
      });
    }, testTimeout);

    test.run(ctx)
      .then((result) => {
        clearTimeout(timer);
        resolve({
          ...result,
          duration: 0, // Will be set by caller
        });
      })
      .catch((error) => {
        clearTimeout(timer);
        resolve({
          passed: false,
          message: error instanceof Error ? error.message : String(error),
          duration: 0,
        });
      });
  });
}

/**
 * Dump session event logs for debugging real mode failures
 */
async function dumpSessionLogs(ctx: TestContext): Promise<void> {
  try {
    const sessions = ctx.sessionManager.listSessions({});
    if (sessions.length === 0) return;

    console.log('  📋 ' + t('testOrchestration.sessionLogs'));
    for (const session of sessions) {
      console.log(t('testOrchestration.sessionLogLine', { id: session.id, role: session.agentRole, status: session.status }));
      if (session.terminationReason) {
        console.log(t('testOrchestration.terminationReason', { reason: session.terminationReason }));
      }
    }
  } catch {
    // Ignore errors when dumping logs
  }
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// ============================================================================
// Command Definitions
// ============================================================================

const testOrchestrationOptions = [
  {
    name: 'test',
    short: 't',
    description: t('testOrchestration.option.test'),
    hasValue: true,
  },
  {
    name: 'mode',
    short: 'm',
    description: t('testOrchestration.option.mode'),
    hasValue: true,
  },
  {
    name: 'tag',
    description: t('testOrchestration.option.tag'),
    hasValue: true,
  },
  {
    name: 'bail',
    description: t('testOrchestration.option.bail'),
  },
  {
    name: 'verbose',
    short: 'v',
    description: t('testOrchestration.option.verbose'),
  },
  {
    name: 'timeout',
    description: t('testOrchestration.option.timeout'),
    hasValue: true,
  },
  {
    name: 'skip-cleanup',
    description: t('testOrchestration.option.skipCleanup'),
  },
];

async function testOrchestrationHandler(
  _args: string[],
  options: GlobalOptions & {
    test?: string;
    mode?: string;
    tag?: string;
    bail?: boolean;
    timeout?: string;
    'skip-cleanup'?: boolean;
  }
): Promise<CommandResult> {
  const testOptions: TestOrchestrationOptions = {
    test: options.test,
    verbose: options.verbose,
    timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
    skipCleanup: options['skip-cleanup'],
    mode: (options.mode === 'real' ? 'real' : 'mock') as 'mock' | 'real',
    bail: options.bail,
    tag: options.tag,
  };

  return runOrchestrationTests(testOptions);
}

const testOrchestrationCommand: Command = {
  name: 'test-orchestration',
  description: t('testOrchestration.description'),
  usage: 'sf test-orchestration [options]',
  options: testOrchestrationOptions,
  handler: testOrchestrationHandler as Command['handler'],
};

// ============================================================================
// Exports
// ============================================================================

export const testOrchestrationCommands: readonly Command[] = [
  testOrchestrationCommand,
];

export { runOrchestrationTests };

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Run as CLI when executed directly
 */
async function main() {
  const args = process.argv.slice(2);

  const options: TestOrchestrationOptions = {};

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--test' || arg === '-t') {
      options.test = args[++i];
    } else if (arg === '--mode' || arg === '-m') {
      const modeArg = args[++i];
      options.mode = modeArg === 'real' ? 'real' : 'mock';
    } else if (arg === '--tag') {
      options.tag = args[++i];
    } else if (arg === '--bail') {
      options.bail = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--timeout') {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === '--skip-cleanup') {
      options.skipCleanup = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(t('testOrchestration.cliHelp'));
      process.exit(0);
    }
  }

  const result = await runOrchestrationTests(options);
  process.exit(result.exitCode);
}

// Run if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error(t('testOrchestration.fatalErrorCli', { error: String(error) }));
    process.exit(1);
  });
}
