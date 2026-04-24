/**
 * ViewToggle - Toggle between list and kanban view modes
 *
 * A compact toggle button group for switching between task view modes.
 * Supports keyboard shortcuts (V L for list, V K for kanban).
 */

import { List, LayoutGrid } from 'lucide-react';
import { useTranslation } from '@stoneforge/i18n';
import type { ViewMode } from '../../lib/task-constants';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  const { t } = useTranslation('smithy');
  return (
    <div
      className="flex items-center bg-[var(--color-surface-elevated)] rounded-md p-0.5 border border-[var(--color-border)]"
      data-testid="tasks-view-toggle"
    >
      <button
        onClick={() => onViewChange('list')}
        className={`inline-flex items-center justify-center px-2 py-1.5 text-sm rounded transition-all duration-200 ${
          view === 'list'
            ? 'bg-[var(--color-primary)] text-white shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
        }`}
        data-testid="tasks-view-list"
        aria-label={t('tasks.listView')}
        title={t('tasks.listView')}
      >
        <List className="w-4 h-4" />
        <span className="pl-2 hidden @sm:inline">{t('tasks.tabAll')}</span>
      </button>
      <button
        onClick={() => onViewChange('kanban')}
        className={`inline-flex items-center justify-center px-2 py-1.5 text-sm rounded transition-all duration-200 ${
          view === 'kanban'
            ? 'bg-[var(--color-primary)] text-white shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
        }`}
        data-testid="tasks-view-kanban"
        aria-label={t('tasks.kanbanView')}
        title={t('tasks.kanbanView')}
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="pl-2 hidden @sm:inline">Kanban</span>
      </button>
    </div>
  );
}
