/**
 * Defaults Section component for settings
 */

import { useState, useEffect } from 'react';
import { List, LayoutGrid, Home, GitBranch, Clock, ArrowUp, Calendar, FileText } from 'lucide-react';
import { useTranslation } from '@stoneforge/i18n';
import type { DefaultsSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { getStoredDefaults, setStoredDefaults } from '../utils';
import { OptionCard } from './OptionCard';

interface DefaultsSectionProps {
  isMobile: boolean;
}

export function DefaultsSection({ isMobile: _isMobile }: DefaultsSectionProps) {
  const { t } = useTranslation('quarry');
  const [defaults, setDefaults] = useState<DefaultsSettings>(DEFAULT_SETTINGS);

  // Load settings on mount
  useEffect(() => {
    setDefaults(getStoredDefaults());
  }, []);

  const updateSetting = <K extends keyof DefaultsSettings>(key: K, value: DefaultsSettings[K]) => {
    const newDefaults = { ...defaults, [key]: value };
    setDefaults(newDefaults);
    setStoredDefaults(newDefaults);
  };

  return (
    <div data-testid="settings-defaults-section">
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('defaultsSection.title')}</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        {t('defaultsSection.description')}
      </p>

      {/* Tasks Default View */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">{t('defaultsSection.tasksView')}</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
          {t('defaultsSection.tasksViewDescription')}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <OptionCard
            value="list"
            label={t('defaultsSection.listView')}
            description={t('defaultsSection.listViewDescription')}
            icon={List}
            isSelected={defaults.tasksView === 'list'}
            onSelect={() => updateSetting('tasksView', 'list')}
            testId="default-tasks-view-list"
          />
          <OptionCard
            value="kanban"
            label={t('defaultsSection.kanbanView')}
            description={t('defaultsSection.kanbanViewDescription')}
            icon={LayoutGrid}
            isSelected={defaults.tasksView === 'kanban'}
            onSelect={() => updateSetting('tasksView', 'kanban')}
            testId="default-tasks-view-kanban"
          />
        </div>
      </div>

      {/* Dashboard Default Lens */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">{t('defaultsSection.dashboardLens')}</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
          {t('defaultsSection.dashboardLensDescription')}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <OptionCard
            value="overview"
            label={t('defaultsSection.overview')}
            description={t('defaultsSection.overviewDescription')}
            icon={Home}
            isSelected={defaults.dashboardLens === 'overview'}
            onSelect={() => updateSetting('dashboardLens', 'overview')}
            testId="default-dashboard-lens-overview"
          />
          <OptionCard
            value="dependencies"
            label={t('defaultsSection.dependencies')}
            description={t('defaultsSection.dependenciesDescription')}
            icon={GitBranch}
            isSelected={defaults.dashboardLens === 'dependencies'}
            onSelect={() => updateSetting('dashboardLens', 'dependencies')}
            testId="default-dashboard-lens-dependencies"
          />
          <OptionCard
            value="timeline"
            label={t('defaultsSection.timeline')}
            description={t('defaultsSection.timelineDescription')}
            icon={Clock}
            isSelected={defaults.dashboardLens === 'timeline'}
            onSelect={() => updateSetting('dashboardLens', 'timeline')}
            testId="default-dashboard-lens-timeline"
          />
        </div>
      </div>

      {/* Default Sort Order */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">{t('defaultsSection.defaultSort')}</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
          {t('defaultsSection.defaultSortDescription')}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <OptionCard
            value="updated_at"
            label={t('defaultsSection.lastUpdated')}
            description={t('defaultsSection.lastUpdatedDescription')}
            icon={Clock}
            isSelected={defaults.sortOrder === 'updated_at'}
            onSelect={() => updateSetting('sortOrder', 'updated_at')}
            testId="default-sort-updated"
          />
          <OptionCard
            value="created_at"
            label={t('defaultsSection.dateCreated')}
            description={t('defaultsSection.dateCreatedDescription')}
            icon={Calendar}
            isSelected={defaults.sortOrder === 'created_at'}
            onSelect={() => updateSetting('sortOrder', 'created_at')}
            testId="default-sort-created"
          />
          <OptionCard
            value="priority"
            label={t('defaultsSection.priority')}
            description={t('defaultsSection.priorityDescription')}
            icon={ArrowUp}
            isSelected={defaults.sortOrder === 'priority'}
            onSelect={() => updateSetting('sortOrder', 'priority')}
            testId="default-sort-priority"
          />
          <OptionCard
            value="title"
            label={t('defaultsSection.title')}
            description={t('defaultsSection.titleDescription')}
            icon={FileText}
            isSelected={defaults.sortOrder === 'title'}
            onSelect={() => updateSetting('sortOrder', 'title')}
            testId="default-sort-title"
          />
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        {t('defaultsSection.footer')}
      </p>
    </div>
  );
}
