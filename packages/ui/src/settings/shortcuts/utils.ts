/**
 * Shortcuts utilities for Settings pages
 *
 * Shared utilities for formatting and grouping keyboard shortcuts
 * used by both web and orchestrator-web apps.
 */

import type { ShortcutCategory, ShortcutDefinition } from '../../hooks/useKeyboardShortcuts';
import type { TFunction } from '@stoneforge/i18n';

/**
 * Detect if the current platform is macOS
 */
export function isMac(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/**
 * Format a shortcut string for display with platform-appropriate symbols
 * - Mac: Cmd -> ⌘, Ctrl -> ⌃, Alt -> ⌥, Shift -> ⇧
 * - Other: Cmd -> Ctrl
 */
export function formatShortcutDisplay(keys: string): string {
  if (isMac()) {
    return keys.replace(/Cmd/gi, '⌘').replace(/Ctrl/gi, '⌃').replace(/Alt/gi, '⌥').replace(/Shift/gi, '⇧');
  }
  return keys.replace(/Cmd/gi, 'Ctrl');
}

/**
 * Category labels for display (i18n keys)
 */
export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  navigation: 'shortcuts.category.navigation',
  actions: 'shortcuts.category.actions',
  views: 'shortcuts.category.views',
  editing: 'shortcuts.category.editing',
  other: 'shortcuts.category.other',
};

/**
 * Get translated category label
 */
export function getCategoryLabel(category: ShortcutCategory, t: TFunction): string {
  return t(CATEGORY_LABELS[category]);
}

/**
 * Shortcut item for display
 */
export interface ShortcutItem {
  actionId: string;
  description: string;
  defaultKeys: string;
}

/**
 * Group shortcuts by category for display in settings
 * @param defaults - App-specific default shortcuts
 */
export function groupShortcutsByCategory(
  defaults: Record<string, ShortcutDefinition>
): Record<ShortcutCategory, ShortcutItem[]> {
  const groups: Record<ShortcutCategory, ShortcutItem[]> = {
    navigation: [],
    actions: [],
    views: [],
    editing: [],
    other: [],
  };

  for (const [actionId, config] of Object.entries(defaults)) {
    const category = config.category || 'other';
    groups[category].push({
      actionId,
      description: config.description || actionId,
      defaultKeys: config.keys,
    });
  }

  return groups;
}
