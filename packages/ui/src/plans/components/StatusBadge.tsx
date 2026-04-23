/**
 * StatusBadge - Displays plan status with icon and color
 */

import { useTranslation } from '@stoneforge/i18n';
import { STATUS_CONFIG } from '../constants';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation('ui');
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;

  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.color}`}
    >
      {config.icon}
      {t(config.label)}
    </span>
  );
}
