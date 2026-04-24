/**
 * Constants for the Documents page
 */

import { FileType, Hash, Code } from 'lucide-react';
import { useTranslation } from '@stoneforge/i18n';

export const SEARCH_DEBOUNCE_DELAY = 300;
export const DEFAULT_PAGE_SIZE = 25;
export const DOCUMENT_ITEM_HEIGHT = 64;
export const LIBRARY_ITEM_HEIGHT = 36;

// Static config for non-component usage (labels will not be translated)
export const CONTENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  text: { label: 'Plain Text', icon: <FileType className="w-4 h-4" />, color: 'bg-gray-100 text-gray-700' },
  markdown: { label: 'Markdown', icon: <Hash className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700' },
  json: { label: 'JSON', icon: <Code className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700' },
};

// Hook for translated labels (use in React components)
export function useContentTypeConfig() {
  const { t } = useTranslation('smithy');
  return {
    text: { label: t('documents.plainText'), icon: <FileType className="w-4 h-4" />, color: 'bg-gray-100 text-gray-700' },
    markdown: { label: t('documents.markdown'), icon: <Hash className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700' },
    json: { label: t('documents.json'), icon: <Code className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700' },
  } as Record<string, { label: string; icon: React.ReactNode; color: string }>;
}
