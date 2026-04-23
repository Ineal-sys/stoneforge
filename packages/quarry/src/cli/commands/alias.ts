/**
 * Alias Command - Show and manage command aliases
 *
 * Displays available command aliases.
 */

import type { Command, CommandResult } from '../types.js';
import { success } from '../types.js';
import { getOutputMode, getFormatter } from '../formatter.js';
import { t } from '../i18n/index.js';
import { getAllAliases } from '../runner.js';
import type { GlobalOptions } from '../types.js';

// ============================================================================
// Handler
// ============================================================================

function aliasHandler(
  _args: string[],
  options: GlobalOptions
): CommandResult {
  const aliasMap = getAllAliases();
  const mode = getOutputMode(options);

  if (mode === 'json') {
    const aliases: Record<string, string> = {};
    for (const [alias, target] of aliasMap) {
      aliases[alias] = target;
    }
    return success(aliases);
  }

  if (aliasMap.size === 0) {
    return success(null, t('alias.noAliases'));
  }

  if (mode === 'quiet') {
    const lines: string[] = [];
    for (const [alias, target] of aliasMap) {
      lines.push(`${alias}=${target}`);
    }
    return success(lines.join('\n'));
  }

  // Human-readable output
  const formatter = getFormatter(mode);
  const headers = [t('alias.label.alias'), t('alias.label.command')];
  const rows: string[][] = [];

  // Sort aliases alphabetically
  const sortedAliases = Array.from(aliasMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  for (const [alias, target] of sortedAliases) {
    rows.push([alias, target]);
  }

  const table = formatter.table(headers, rows);
  return success(null, `${t('alias.title')}:\n\n${table}`);
}

// ============================================================================
// Command Definition
// ============================================================================

export const aliasCommand: Command = {
  name: 'alias',
  description: t('alias.description'),
  usage: 'sf alias',
  help: t('alias.help'),
  options: [],
  handler: aliasHandler,
};
