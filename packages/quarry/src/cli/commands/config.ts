/**
 * config command - Manage configuration
 *
 * Subcommands:
 * - show: Display current configuration
 * - set: Set a configuration value
 * - unset: Remove a configuration value
 * - edit: Open config file in default editor
 */

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Command, CommandResult, GlobalOptions } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { t } from '../i18n/index.js';
import {
  getConfig,
  getValue,
  setValue,
  unsetValue,
  getConfigPath,
  getValueSource,
  isValidConfigPath,
  VALID_CONFIG_PATHS,
} from '../../config/index.js';

// ============================================================================
// Config Show
// ============================================================================

async function configShowHandler(
  args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  try {
    const config = getConfig();
    const configPath = getConfigPath();

    if (args.length > 0) {
      // Show specific value - validate path first
      const path = args[0];
      if (!isValidConfigPath(path)) {
        const validPaths = VALID_CONFIG_PATHS.join(', ');
        return failure(
          t('config.error.unknownKey', { path, validKeys: validPaths }),
          ExitCode.VALIDATION
        );
      }
      const value = getValue(path);
      const source = getValueSource(path);
      return success(
        { path, value, source },
        t('config.success.showValue', { path, value: JSON.stringify(value), source })
      );
    }

    // Show all config
    const lines: string[] = [
      t('config.label.configurationFrom', { path: configPath ?? t('config.label.defaults') }),
      '',
    ];

    for (const [section, values] of Object.entries(config)) {
      if (typeof values === 'object' && values !== null) {
        lines.push(`${section}:`);
        for (const [key, value] of Object.entries(values)) {
          lines.push(`  ${key}: ${JSON.stringify(value)}`);
        }
      } else {
        lines.push(`${section}: ${JSON.stringify(values)}`);
      }
    }

    return success(config, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('config.error.failedRead', { message }), ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Config Set
// ============================================================================

async function configSetHandler(
  args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure(t('config.usage.set'), ExitCode.INVALID_ARGUMENTS);
  }

  const [path, ...valueParts] = args;
  const valueStr = valueParts.join(' ');

  // Validate path is a known configuration key
  if (!isValidConfigPath(path)) {
    const validPaths = VALID_CONFIG_PATHS.join(', ');
    return failure(
      t('config.error.unknownKey', { path, validKeys: validPaths }),
      ExitCode.VALIDATION
    );
  }

  // Try to parse as JSON, fall back to string
  let value: unknown;
  try {
    value = JSON.parse(valueStr);
  } catch {
    value = valueStr;
  }

  try {
    setValue(path, value as never);
    return success(
      { path, value },
      t('config.success.set', { path, value: JSON.stringify(value) })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('config.error.failedSet', { message }), ExitCode.VALIDATION);
  }
}

// ============================================================================
// Config Unset
// ============================================================================

async function configUnsetHandler(
  args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure(t('config.usage.unset'), ExitCode.INVALID_ARGUMENTS);
  }

  const path = args[0];

  // Validate path is a known configuration key
  if (!isValidConfigPath(path)) {
    const validPaths = VALID_CONFIG_PATHS.join(', ');
    return failure(
      t('config.error.unknownKey', { path, validKeys: validPaths }),
      ExitCode.VALIDATION
    );
  }

  try {
    unsetValue(path);
    return success(
      { path },
      t('config.success.unset', { path })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('config.error.failedUnset', { message }), ExitCode.VALIDATION);
  }
}

// ============================================================================
// Config Edit
// ============================================================================

/**
 * Get the editor command to use
 * Priority: $EDITOR > $VISUAL > platform default
 */
function getEditor(): string {
  if (process.env.EDITOR) {
    return process.env.EDITOR;
  }
  if (process.env.VISUAL) {
    return process.env.VISUAL;
  }
  // Platform-specific defaults
  if (process.platform === 'win32') {
    return 'notepad';
  }
  // Unix-like systems: try common editors
  return 'vi';
}

async function configEditHandler(
  _args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  try {
    const configPath = getConfigPath();

    if (!configPath) {
      return failure(
        t('config.error.noConfigFile'),
        ExitCode.NOT_FOUND
      );
    }

    // If the config file doesn't exist, create an empty one
    if (!existsSync(configPath)) {
      const dir = dirname(configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(
        configPath,
        '# Stoneforge Configuration\n# See docs for available options\n\n',
        'utf-8'
      );
    }

    const editor = getEditor();

    // Spawn editor and wait for it to close
    const result = spawnSync(editor, [configPath], {
      stdio: 'inherit',
      shell: true,
    });

    if (result.error) {
      return failure(
        t('config.error.editorFailed', { editor, message: result.error.message }),
        ExitCode.GENERAL_ERROR
      );
    }

    if (result.status !== 0) {
      return failure(
        t('config.error.editorExited', { status: result.status }),
        ExitCode.GENERAL_ERROR
      );
    }

    return success(
      { editor, path: configPath },
      t('config.success.edited', { path: configPath })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('config.error.failedEdit', { message }), ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const configCommand: Command = {
  name: 'config',
  description: t('config.description'),
  usage: 'sf config <subcommand> [args]',
  help: t('config.help'),
  handler: configShowHandler,
  subcommands: {
    show: {
      name: 'show',
      description: t('config.show.description'),
      usage: 'sf config show [path]',
      help: t('config.show.help'),
      handler: configShowHandler,
    },
    set: {
      name: 'set',
      description: t('config.set.description'),
      usage: 'sf config set <path> <value>',
      help: t('config.set.help'),
      handler: configSetHandler,
    },
    unset: {
      name: 'unset',
      description: t('config.unset.description'),
      usage: 'sf config unset <path>',
      help: t('config.unset.help'),
      handler: configUnsetHandler,
    },
    edit: {
      name: 'edit',
      description: t('config.edit.description'),
      usage: 'sf config edit',
      help: t('config.edit.help'),
      handler: configEditHandler,
    },
  },
};
