/**
 * StatusFilter - Tab-based filter for plan statuses
 */

import { useTranslation } from '@stoneforge/i18n';

interface StatusFilterProps {
  selectedStatus: string | null;
  onStatusChange: (status: string | null) => void;
}

const STATUS_VALUES = [
  { value: null, labelKey: 'plans.filter.all' },
  { value: 'active', labelKey: 'plans.status.active' },
  { value: 'draft', labelKey: 'plans.status.draft' },
  { value: 'completed', labelKey: 'plans.status.completed' },
  { value: 'cancelled', labelKey: 'plans.status.cancelled' },
] as const;

export function StatusFilter({ selectedStatus, onStatusChange }: StatusFilterProps) {
  const { t } = useTranslation('ui');

  return (
    <div data-testid="status-filter" className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {STATUS_VALUES.map((status) => (
        <button
          key={status.value ?? 'all'}
          data-testid={`status-filter-${status.value ?? 'all'}`}
          onClick={() => onStatusChange(status.value)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            selectedStatus === status.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {t(status.labelKey)}
        </button>
      ))}
    </div>
  );
}
