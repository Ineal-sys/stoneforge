/**
 * CLI i18n - Internationalization for Quarry CLI
 *
 * Lightweight i18next initialization for CLI usage (no React dependency).
 * Uses French as the default and only locale.
 */

import i18next from 'i18next';
import fr from './fr.json';

/**
 * Initialize CLI i18n with French translations.
 * Called once at CLI startup.
 */
export function initCliI18n(): void {
  if (!i18next.isInitialized) {
    i18next.init({
      resources: { fr: { translation: fr } },
      lng: 'fr',
      fallbackLng: 'fr',
      interpolation: {
        escapeValue: false,
      },
    });
  }
}

/**
 * Translate a key with optional interpolation parameters.
 *
 * @example
 * t('task.notFound', { id: 'el-abc123' })
 * // => "Tâche introuvable : el-abc123"
 */
export const t = i18next.t.bind(i18next);

// Initialize immediately on import
initCliI18n();
