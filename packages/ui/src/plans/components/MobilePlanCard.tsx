/**
 * MobilePlanCard - Card-based plan display for mobile devices
 *
 * A touch-friendly plan card designed for mobile list views.
 * Shows key plan information in a compact, readable format with progress ring.
 */

import { useMemo } from 'react';
import {
  ClipboardList,
  FileEdit,
  CircleDot,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useTranslation } from '@stoneforge/i18n';
import type { HydratedPlan } from '../types';

interface MobilePlanCardProps {
  plan: HydratedPlan;
  isSelected: boolean;
  onClick: () => void;
  searchMatchIndices?: number[];
  /** Optional ProgressRing component to render */
  progressRing?: React.ReactNode;
}

const STATUS_ICONS: Record<string, { icon: React.ReactNode; color: string; labelKey: string }> = {
  draft: {
    labelKey: 'plans.status.draft',
    icon: <FileEdit className="w-3 h-3" />,
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
  },
  active: {
    labelKey: 'plans.status.active',
    icon: <CircleDot className="w-3 h-3" />,
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  completed: {
    labelKey: 'plans.status.completed',
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
  cancelled: {
    labelKey: 'plans.status.cancelled',
    icon: <XCircle className="w-3 h-3" />,
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  },
};

/**
 * Highlights matched characters in a title based on match indices.
 */
function highlightMatches(title: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) {
    return <>{title}</>;
  }

  const result: React.ReactNode[] = [];
  const indexSet = new Set(indices);
  let lastIndex = 0;

  for (let i = 0; i < title.length; i++) {
    if (indexSet.has(i)) {
      if (i > lastIndex) {
        result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex, i)}</span>);
      }
      result.push(
        <mark key={`match-${i}`} className="bg-yellow-200 text-gray-900 dark:bg-yellow-700 dark:text-white rounded-sm px-0.5">
          {title[i]}
        </mark>
      );
      lastIndex = i + 1;
    }
  }

  if (lastIndex < title.length) {
    result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex)}</span>);
  }

  return <>{result}</>;
}

export function MobilePlanCard({
  plan,
  isSelected,
  onClick,
  searchMatchIndices,
  progressRing,
}: MobilePlanCardProps) {
  const { t } = useTranslation('ui');
  const statusConfig = STATUS_ICONS[plan.status] || STATUS_ICONS.draft;
  const progress = plan._progress;
  const hasProgress = progress && progress.totalTasks > 0;

  // Compute highlighted title based on search query
  const highlightedTitle = useMemo(() => {
    if (searchMatchIndices && searchMatchIndices.length > 0) {
      return highlightMatches(plan.title, searchMatchIndices);
    }
    return plan.title;
  }, [plan.title, searchMatchIndices]);

  return (
    <div
      className={`
        flex gap-3 p-4
        bg-[var(--color-surface)] border-b border-[var(--color-border)]
        cursor-pointer transition-colors duration-150
        active:bg-[var(--color-surface-hover)]
        ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
      `}
      onClick={onClick}
      data-testid={`mobile-plan-card-${plan.id}`}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        <ClipboardList className="w-5 h-5 text-blue-500" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <div
          className="font-medium text-[var(--color-text)] line-clamp-2 mb-1"
          data-testid={`mobile-plan-title-${plan.id}`}
        >
          {highlightedTitle}
        </div>

        {/* ID and time */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs text-[var(--color-text-muted)] font-mono">
            {plan.id}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            · {formatRelativeTime(t, plan.updatedAt)}
          </span>
        </div>

        {/* Status and tags */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status badge */}
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${statusConfig.color}`}>
            {statusConfig.icon}
            {t(statusConfig.labelKey)}
          </span>

          {/* Tags (limited) */}
          {plan.tags && plan.tags.length > 0 && (
            <>
              {plan.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] rounded truncate max-w-20"
                >
                  {tag}
                </span>
              ))}
              {plan.tags.length > 2 && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  +{plan.tags.length - 2}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Progress ring */}
      <div className="flex-shrink-0 self-center">
        {progressRing ? (
          progressRing
        ) : hasProgress ? (
          <div
            className="w-8 h-8 rounded-full border-2 border-blue-500 flex items-center justify-center"
            title={t('plans.progress.percentComplete', { percentage: progress.completionPercentage })}
            data-testid={`mobile-plan-progress-${plan.id}`}
          >
            <span className="text-[10px] text-blue-500 font-medium">{progress.completionPercentage}%</span>
          </div>
        ) : (
          <div
            className="w-8 h-8 rounded-full border-2 border-dashed border-[var(--color-border)] flex items-center justify-center"
            title={t('plans.progress.noTasks')}
          >
            <span className="text-[8px] text-[var(--color-text-muted)]">--</span>
          </div>
        )}
      </div>

      {/* Chevron indicator */}
      <div className="flex-shrink-0 self-center text-[var(--color-text-tertiary)]">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Format relative time from a date string using i18n
 */
function formatRelativeTime(
  t: (key: string, options?: Record<string, unknown>) => string,
  dateString: string,
): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('plans.time.justNow');
  if (diffMins < 60) return t('plans.time.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('plans.time.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('plans.time.daysAgo', { count: diffDays });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
