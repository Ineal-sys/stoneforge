import { initI18n, i18n } from '@stoneforge/i18n';
import frSmithyNext from './fr/smithy-next.json';

/**
 * Initialize i18n for the smithy-next application.
 * Adds the smithyNext namespace with app-specific French translations
 * on top of the shared common namespace provided by @stoneforge/i18n.
 */

// Initialize the shared i18n instance (common namespace)
initI18n();

// Register app-specific namespace
i18n.addResourceBundle('fr', 'smithyNext', frSmithyNext);

export { i18n };
export { useTranslation, Trans, withTranslation } from '@stoneforge/i18n';
