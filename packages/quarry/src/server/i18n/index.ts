/**
 * Server-side i18n for quarry-server
 *
 * Simple lookup-based translation for API error messages.
 * Uses error codes as keys, returns French messages.
 */

import fr from './fr.json';

type TranslationParams = Record<string, string | number>;

// Current locale translations (keyed by error code)
const messages: Record<string, string> = fr as unknown as Record<string, string>;

/**
 * Translate an error code to a French message.
 * Supports {{variable}} interpolation.
 *
 * @param code - Error code (e.g. 'NOT_FOUND', 'INVALID_INPUT')
 * @param params - Optional interpolation parameters
 * @returns Translated French message, or the code itself if no translation found
 */
export function t(code: string, params?: TranslationParams): string {
  let message = messages[code];

  if (!message) {
    return code;
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
  }

  return message;
}

/**
 * Get all available translations (for debugging/testing)
 */
export function getAllMessages(): Readonly<Record<string, string>> {
  return { ...messages };
}
