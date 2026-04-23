/**
 * @stoneforge/ui Documents Constants
 *
 * Sort options, filter options, and storage keys for document components.
 */

import type { DocumentSortOption, ContentTypeFilterOption, DocumentFilterConfig } from './types';

// ============================================================================
// Sort Options
// ============================================================================

export const DOCUMENT_SORT_OPTIONS: DocumentSortOption[] = [
  { value: 'updatedAt', labelKey: 'documents.sort.updated', defaultDirection: 'desc' },
  { value: 'createdAt', labelKey: 'documents.sort.created', defaultDirection: 'desc' },
  { value: 'title', labelKey: 'documents.sort.title', defaultDirection: 'asc' },
  { value: 'contentType', labelKey: 'documents.sort.type', defaultDirection: 'asc' },
];

// ============================================================================
// Content Type Filter Options
// ============================================================================

export const CONTENT_TYPE_FILTER_OPTIONS: ContentTypeFilterOption[] = [
  { value: 'text', labelKey: 'documents.contentType.text', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  { value: 'markdown', labelKey: 'documents.contentType.markdown', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' },
  { value: 'json', labelKey: 'documents.contentType.json', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
];

// ============================================================================
// Storage Keys
// ============================================================================

export const DOCUMENT_STORAGE_KEYS = {
  sortField: 'documents.sortBy',
  sortDirection: 'documents.sortDir',
} as const;

// ============================================================================
// Empty Filter Config
// ============================================================================

export const EMPTY_DOCUMENT_FILTER: DocumentFilterConfig = {
  contentTypes: [],
  tags: [],
};
