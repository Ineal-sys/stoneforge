/**
 * Time utility functions for displaying relative times and grouping by time periods
 * TB94: Inbox Time-Ago Indicator
 */

import { i18n } from '@stoneforge/i18n';

/**
 * Time period categories for grouping messages
 */
export type TimePeriod = 'today' | 'yesterday' | 'this-week' | 'earlier';

/**
 * Time period display labels - uses i18n keys
 */
export const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  today: 'timeLib.today',
  yesterday: 'timeLib.yesterday',
  'this-week': 'timeLib.thisWeek',
  earlier: 'timeLib.earlier',
};

/**
 * Gets the translated display label for a time period
 */
export function getTimePeriodLabel(period: TimePeriod): string {
  return i18n.t(TIME_PERIOD_LABELS[period]);
}

/**
 * Determines which time period a date falls into
 */
export function getTimePeriod(date: Date | string): TimePeriod {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  // Reset times to start of day for comparison
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6); // Last 7 days including today

  if (d >= todayStart) {
    return 'today';
  } else if (d >= yesterdayStart) {
    return 'yesterday';
  } else if (d >= weekStart) {
    return 'this-week';
  } else {
    return 'earlier';
  }
}

/**
 * Groups items by time period based on their date field
 * Returns items in the same order but with group information
 */
export interface GroupedItem<T> {
  item: T;
  period: TimePeriod;
  isFirstInGroup: boolean;
}

export function groupByTimePeriod<T>(
  items: T[],
  getDate: (item: T) => string | Date
): GroupedItem<T>[] {
  const result: GroupedItem<T>[] = [];
  let lastPeriod: TimePeriod | null = null;

  for (const item of items) {
    const date = getDate(item);
    const period = getTimePeriod(date);
    const isFirstInGroup = period !== lastPeriod;

    result.push({
      item,
      period,
      isFirstInGroup,
    });

    lastPeriod = period;
  }

  return result;
}

/**
 * Formats a date as a relative time string
 * Updates granularity based on how old the date is:
 * - < 1 min: "just now"
 * - < 1 hour: "Xm ago"
 * - < 24 hours: "Xh ago"
 * - < 7 days: "Xd ago"
 * - Otherwise: "Jan 15" (short date format)
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return i18n.t('timeLib.justNow');
  }
  if (minutes < 60) {
    return i18n.t('timeLib.minutesAgo', { count: minutes });
  }
  if (hours < 24) {
    return i18n.t('timeLib.hoursAgo', { count: hours });
  }
  if (days === 1) {
    return i18n.t('timeLib.yesterday');
  }
  if (days < 7) {
    return i18n.t('timeLib.daysAgo', { count: days });
  }

  // For older dates, show the actual date
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Formats a date as a compact relative time string (for list items)
 * - < 1 min: "now"
 * - < 1 hour: "Xm"
 * - < 24 hours: "Xh"
 * - < 7 days: "Xd"
 * - Otherwise: "Jan 15"
 */
export function formatCompactTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return i18n.t('timeLib.now');
  }
  if (minutes < 60) {
    return i18n.t('timeLib.minutesShort', { count: minutes });
  }
  if (hours < 24) {
    return i18n.t('timeLib.hoursShort', { count: hours });
  }
  if (days < 7) {
    return i18n.t('timeLib.daysShort', { count: days });
  }

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Gets the appropriate update interval for a given date
 * - Recent (< 1 hour): update every minute (60000ms)
 * - Today: update every 5 minutes (300000ms)
 * - Older: update every hour (3600000ms)
 */
export function getUpdateInterval(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const hours = Math.floor(diff / 3600000);

  if (hours < 1) {
    return 60000; // 1 minute
  }
  if (hours < 24) {
    return 300000; // 5 minutes
  }
  return 3600000; // 1 hour
}

/**
 * Calculates the next update interval based on the oldest "recent" item
 * If most items are old, returns a longer interval
 */
export function getSmartUpdateInterval(dates: (Date | string)[]): number {
  if (dates.length === 0) return 3600000; // 1 hour default

  // Find the most recent date
  let mostRecent = new Date(0);
  for (const date of dates) {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (d > mostRecent) {
      mostRecent = d;
    }
  }

  return getUpdateInterval(mostRecent);
}

// ============================================================================
// TB99: Message Day Separation
// ============================================================================

/**
 * Gets a unique date key for grouping messages by day (YYYY-MM-DD format)
 */
export function getDateKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Formats a date for message day separators
 * - Today: "Today"
 * - Yesterday: "Yesterday"
 * - Older: "Monday, January 15" (full weekday and date)
 */
export function formatDateSeparator(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  // Reset times to start of day for comparison
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const inputDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (inputDayStart.getTime() === todayStart.getTime()) {
    return i18n.t('timeLib.today');
  }
  if (inputDayStart.getTime() === yesterdayStart.getTime()) {
    return i18n.t('timeLib.yesterday');
  }

  // For older dates, show full weekday and date: "Monday, January 15"
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Message with day grouping information
 */
export interface MessageWithDayGroup<T> {
  item: T;
  dateKey: string;
  formattedDate: string;
  isFirstInDay: boolean;
}

/**
 * Groups messages by day for date separators
 * Returns items in the same order but with day grouping information
 */
export function groupMessagesByDay<T>(
  items: T[],
  getDate: (item: T) => string | Date
): MessageWithDayGroup<T>[] {
  const result: MessageWithDayGroup<T>[] = [];
  let lastDateKey: string | null = null;

  for (const item of items) {
    const date = getDate(item);
    const dateKey = getDateKey(date);
    const isFirstInDay = dateKey !== lastDateKey;
    const formattedDate = isFirstInDay ? formatDateSeparator(date) : '';

    result.push({
      item,
      dateKey,
      formattedDate,
      isFirstInDay,
    });

    lastDateKey = dateKey;
  }

  return result;
}
