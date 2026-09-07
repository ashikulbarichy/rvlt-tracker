/**
 * Formats timestamps app-wide according to precision rules:
 * - 0 to 59 minutes: "Just now" or "Xm ago" (e.g. "Updated 5m ago" / "12m ago")
 * - 1 to 23 hours: "Xh ago" (e.g. "Updated 2h ago")
 * - 1 to 29 days: "Xd ago" (e.g. "Updated 3d ago")
 * - 1 month+ (>= 30 days): "Xmo Yd ago" (e.g. "Updated 1mo 4d ago" or "2mo ago")
 */
export function formatRelativeTime(
  dateInput: string | number | Date | null | undefined,
  options?: { prefix?: string }
): string {
  if (!dateInput) return options?.prefix ? `${options.prefix} just now` : 'Just now';

  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return options?.prefix ? `${options.prefix} just now` : 'Just now';

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let timeString = '';

  if (diffMinutes < 1) {
    timeString = 'just now';
  } else if (diffMinutes <= 59) {
    timeString = `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    timeString = `${diffHours}h ago`;
  } else if (diffDays < 30) {
    timeString = `${diffDays}d ago`;
  } else {
    const months = Math.floor(diffDays / 30);
    const remainingDays = diffDays % 30;
    if (remainingDays > 0) {
      timeString = `${months}mo ${remainingDays}d ago`;
    } else {
      timeString = `${months}mo ago`;
    }
  }

  if (options?.prefix) {
    return `${options.prefix} ${timeString}`;
  }

  return timeString;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Parses a 'YYYY-MM-DD' column value into a local-midnight Date.
 * `new Date('2026-07-12')` would parse as UTC midnight, which renders as the
 * 11th in any negative-offset timezone and visibly misplaces timeline bars.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function diffInDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Last day of the month, at local midnight. */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** First-of-month Dates covering `start` through `end`, inclusive. */
export function eachMonthBetween(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  let cursor = startOfMonth(start);
  const last = startOfMonth(end);
  while (cursor <= last) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/** 'Jul 12' — matches the DatePicker's display style without the year. */
export function formatDateShort(value: string | null | undefined): string {
  const date = parseDateOnly(value);
  if (!date) return '';
  return `${MONTH_ABBR[date.getMonth()]} ${date.getDate()}`;
}

export function formatMonthLabel(date: Date): string {
  return `${MONTH_ABBR[date.getMonth()]} ${date.getFullYear()}`;
}
