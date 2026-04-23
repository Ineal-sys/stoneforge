/**
 * help command - Display help information
 */

import { createRequire } from 'node:module';
import type { Command, CommandResult } from '../types.js';
import { success } from '../types.js';
import { t } from '../i18n/index.js';
import { getGlobalOptionsHelp } from '../parser.js';
import { getAllCommands } from '../runner.js';

// ============================================================================
// Version Info
// ============================================================================

const require = createRequire(import.meta.url);
const { version: VERSION } = require('@stoneforge/quarry/package.json');

// ============================================================================
// Help Text
// ============================================================================

// Subcommand hints for resource commands
const SUBCOMMAND_HINTS: Record<string, string> = {
  task: 'create, list, ready, close, ...',
  plan: 'create, activate, tasks, ...',
  dependency: 'add, remove, list, tree',
  message: 'send, reply, list, thread',
  document: 'create, list, search, ...',
  channel: 'create, list, join, ...',
  workflow: 'create, list, promote, ...',
  entity: 'register, list, reports, ...',
  team: 'create, list, ...',
  library: 'create, list, ...',
  inbox: 'read, read-all, archive, ...',
};

// Built-in command categories for display
const COMMAND_CATEGORIES: Record<string, string[]> = {
  [t('help.category.elements')]: ['show', 'update', 'delete', 'history'],
  [t('help.category.tasks')]: ['task'],
  [t('help.category.planning')]: ['plan', 'workflow', 'playbook'],
  [t('help.category.dependencies')]: ['dependency'],
  [t('help.category.communication')]: ['message', 'inbox', 'channel'],
  [t('help.category.knowledge')]: ['document', 'library', 'embeddings'],
  [t('help.category.organization')]: ['entity', 'team'],
  [t('help.category.sync')]: ['sync', 'export', 'import', 'status'],
  [t('help.category.system')]: ['init', 'reset', 'config', 'identity', 'whoami', 'stats'],
  [t('help.category.admin')]: ['doctor', 'migrate', 'gc'],
  [t('help.category.shell')]: ['completion', 'alias', 'install', 'help', 'version'],
};

// All categorized commands for distinguishing plugins
const BUILTIN_COMMANDS = new Set(
  Object.values(COMMAND_CATEGORIES).flat()
);

// Top-level task convenience commands (not shown in categories but listed separately)
const TASK_CONVENIENCE_COMMANDS = [
  'ready', 'blocked', 'backlog', 'close', 'reopen', 'assign', 'defer', 'undefer',
];

// Add task convenience commands to built-in set so they don't appear as plugins
for (const cmd of TASK_CONVENIENCE_COMMANDS) {
  BUILTIN_COMMANDS.add(cmd);
}

/**
 * Generates the main help text dynamically
 */
function generateMainHelp(): string {
  const lines: string[] = [
    t('help.title'),
    '',
    t('help.usage'),
    '       sf <command> [options]',
    '',
    t('help.commands'),
  ];

  const allCommands = getAllCommands();
  const commandMap = new Map(allCommands.map(cmd => [cmd.name, cmd]));

  // Add categorized built-in commands
  for (const [category, commands] of Object.entries(COMMAND_CATEGORIES)) {
    const availableCommands = commands.filter(cmd => commandMap.has(cmd));

    if (availableCommands.length === 0) continue;

    lines.push(`  ${category}:`);
    for (const cmdName of availableCommands) {
      const cmd = commandMap.get(cmdName);
      if (cmd) {
        const hint = SUBCOMMAND_HINTS[cmdName];
        const desc = hint ? `${cmd.description} (${hint})` : cmd.description;
        lines.push(`    ${cmdName.padEnd(16)} ${desc}`);
      }
    }
    lines.push('');
  }

  // Add plugin commands (commands not in built-in set)
  const pluginCommands = allCommands
    .filter(cmd => !BUILTIN_COMMANDS.has(cmd.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (pluginCommands.length > 0) {
    lines.push('  ' + t('help.pluginCommands') + ':');
    for (const cmd of pluginCommands) {
      lines.push(`    ${cmd.name.padEnd(16)} ${cmd.description}`);
    }
    lines.push('');
  }

  // Add aliases section
  lines.push('  ' + t('help.aliases') + ':');
  lines.push('    dep              dependency');
  lines.push('    msg              message');
  lines.push('    doc              document');
  lines.push('    rm, remove       delete');
  lines.push('    s, get           show');
  lines.push('    st               status');
  lines.push('    todo, tasks      ready (also: sf task ready)');
  lines.push('    done             close (also: sf task close)');
  lines.push('    ready, blocked, close, ...  also available as sf task <verb>');
  lines.push('');

  lines.push(getGlobalOptionsHelp());
  lines.push('');
  lines.push(t('help.moreInfo'));

  return lines.join('\n');
}

// ============================================================================
// Handler
// ============================================================================

function helpHandler(): CommandResult {
  return success(undefined, generateMainHelp());
}

function versionHandler(): CommandResult {
  return success({ version: VERSION }, t('help.version', { version: VERSION }));
}

// ============================================================================
// Command Definitions
// ============================================================================

export const helpCommand: Command = {
  name: 'help',
  description: t('help.description'),
  usage: 'sf help [command]',
  handler: helpHandler,
};

export const versionCommand: Command = {
  name: 'version',
  description: t('help.versionDescription'),
  usage: 'sf version',
  handler: versionHandler,
};

/**
 * Gets help text for a specific command
 */
export function getCommandHelp(command: Command): string {
  const lines: string[] = [
    command.description,
    '',
    `Usage: ${command.usage}`,
  ];

  if (command.help) {
    lines.push('', command.help);
  }

  if (command.options && command.options.length > 0) {
    lines.push('', t('help.options') + ':');
    for (const opt of command.options) {
      const shortPart = opt.short ? `-${opt.short}, ` : '    ';
      const valuePart = opt.hasValue ? ` <${opt.name}>` : '';
      const requiredPart = opt.required ? ` (${t('help.required')})` : '';
      lines.push(`  ${shortPart}--${opt.name}${valuePart}${requiredPart}`);
      lines.push(`        ${opt.description}`);
    }
  }

  if (command.subcommands) {
    lines.push('', t('help.subcommands') + ':');
    const seen = new Set<Command>();
    for (const [name, sub] of Object.entries(command.subcommands)) {
      if (seen.has(sub)) continue; // skip aliases
      seen.add(sub);
      lines.push(`  ${name.padEnd(20)} ${sub.description}`);
    }
  }

  lines.push('', getGlobalOptionsHelp());

  return lines.join('\n');
}
