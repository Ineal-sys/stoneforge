/**
 * Quarry Web i18n Initialization
 *
 * Initializes i18next with shared namespaces (common, ui) from @stoneforge/i18n
 * and the app-specific quarry namespace.
 */

import { initI18n, i18n } from '@stoneforge/i18n';
import quarryFr from './fr/quarry.json';

// Add quarry-specific namespace
i18n.addResourceBundle('fr', 'quarry', quarryFr);

// Initialize with all namespaces
initI18n();

// Ensure the quarry namespace is available
if (!i18n.hasLoadedNamespace('quarry')) {
  i18n.loadNamespaces(['quarry']);
}

export { i18n };
