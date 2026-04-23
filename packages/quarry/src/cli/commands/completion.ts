/**
 * Completion Command - Generate shell completion scripts
 *
 * Provides shell completion for bash, zsh, and fish shells.
 */

import type { Command, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';
import { generateCompletion, getInstallInstructions, type ShellType } from '../completion.js';
import { getAllCommands } from '../runner.js';

// ============================================================================
// Supported Shells
// ============================================================================

const SUPPORTED_SHELLS: ShellType[] = ['bash', 'zsh', 'fish'];

// ============================================================================
// Handler
// ============================================================================

function completionHandler(args: string[]): CommandResult {
  const [shell] = args;

  if (!shell) {
    // Show help
    const message = t('completion.helpMessage');

    return success(undefined, message);
  }

  const shellLower = shell.toLowerCase() as ShellType;

  if (!SUPPORTED_SHELLS.includes(shellLower)) {
    return failure(
      t('completion.error.unsupportedShell', { shell, supported: SUPPORTED_SHELLS.join(', ') }),
      ExitCode.INVALID_ARGUMENTS
    );
  }

  try {
    const commands = getAllCommands();
    const script = generateCompletion(shellLower, commands);
    return success({ shell: shellLower }, script);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('completion.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const completionCommand: Command = {
  name: 'completion',
  description: t('completion.description'),
  usage: 'sf completion <shell>',
  help: t('completion.help'),
  options: [],
  handler: completionHandler,
};
