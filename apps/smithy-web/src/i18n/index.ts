/**
 * Smithy-web i18n initialization
 *
 * Extends the shared @stoneforge/i18n with the `smithy` namespace
 * containing all app-specific French translations.
 */

import { i18n, initReactI18next, DEFAULT_LOCALE, DEFAULT_NAMESPACE } from '@stoneforge/i18n';
import frSmithy from './fr/smithy.json';

// Register the smithy namespace with the shared i18n instance
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      fr: {
        [DEFAULT_NAMESPACE]: (i18n.options?.resources as any)?.fr?.[DEFAULT_NAMESPACE] ?? {},
        ui: (i18n.options?.resources as any)?.fr?.ui ?? {},
        smithy: frSmithy,
      },
    },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: DEFAULT_NAMESPACE,
    ns: [DEFAULT_NAMESPACE, 'ui', 'smithy'],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false,
    },
  });
} else {
  // Already initialized — just add our namespace
  if (!i18n.hasResourceBundle(DEFAULT_LOCALE, 'smithy')) {
    i18n.addResourceBundle(DEFAULT_LOCALE, 'smithy', frSmithy);
  }
}

export { i18n } from '@stoneforge/i18n';
export { useTranslation, Trans } from '@stoneforge/i18n';
