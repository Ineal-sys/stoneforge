import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import frCommon from '../locales/fr/common.json';

/**
 * Supported locales in the Stoneforge platform.
 * Currently only French is populated; additional locales can be added here.
 */
export type Locale = 'fr';

/** Default locale used across the platform */
export const DEFAULT_LOCALE: Locale = 'fr';

/** Default namespace for shared/common translations */
export const DEFAULT_NAMESPACE = 'common';

/**
 * All built-in shared translation resources.
 * Apps can extend this with their own namespaces via i18next's addResourceBundle.
 */
export const resources = {
  fr: {
    common: frCommon,
  },
} as const;

/**
 * Initialize i18next with Stoneforge defaults.
 *
 * Call this once at app entry point (e.g. main.tsx or _app.tsx).
 * Returns the initialized i18n instance.
 *
 * @example
 * ```ts
 * import { initI18n } from '@stoneforge/i18n';
 * initI18n();
 * ```
 */
export function initI18n(): typeof i18n {
  // Avoid re-initialization in HMR / test environments
  if (i18n.isInitialized) {
    return i18n;
  }

  i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: DEFAULT_NAMESPACE,
    ns: [DEFAULT_NAMESPACE],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false,
    },
  });

  return i18n;
}

// Re-export i18next and react-i18next utilities for consumer convenience
export { i18n, initReactI18next };
export { useTranslation, Trans, withTranslation } from 'react-i18next';
export type { WithTranslation } from 'react-i18next';
export type { TFunction, i18n as I18nInstance } from 'i18next';
