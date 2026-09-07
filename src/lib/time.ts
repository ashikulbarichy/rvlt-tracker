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

/** 'Jul 12' — matches the DatePicker's display style without the year. */
export function formatDateShort(value: string | null | undefined): string {
  const date = parseDateOnly(value);
  if (!date) return '';
  return `${MONTH_ABBR[date.getMonth()]} ${date.getDate()}`;
}

// ============================================================================
// Fiscal calendar — the financial year runs 1 July to 30 June.
// Quarters and years on the roadmap follow this, not the calendar year.
// ============================================================================

/** 0-indexed: 6 = July. */
export const FISCAL_YEAR_START_MONTH = 6;

/** The 1 July on or before `date`. */
export function fiscalYearStart(date: Date): Date {
  const year = date.getFullYear();
  return date.getMonth() >= FISCAL_YEAR_START_MONTH
    ? new Date(year, FISCAL_YEAR_START_MONTH, 1)
    : new Date(year - 1, FISCAL_YEAR_START_MONTH, 1);
}

/** Months elapsed from the containing fiscal year's start. 0 = July. */
function monthsIntoFiscalYear(date: Date): number {
  const fyStart = fiscalYearStart(date);
  return (date.getFullYear() - fyStart.getFullYear()) * 12 + (date.getMonth() - fyStart.getMonth());
}

/** The start of the fiscal quarter containing `date`. Q1 begins 1 July. */
export function fiscalQuarterStart(date: Date): Date {
  const fyStart = fiscalYearStart(date);
  return addMonths(fyStart, Math.floor(monthsIntoFiscalYear(date) / 3) * 3);
}

/** 1-4, where Q1 is Jul-Sep. */
export function fiscalQuarterOf(date: Date): number {
  return Math.floor(monthsIntoFiscalYear(date) / 3) + 1;
}

/** 'FY 26/27' for the year beginning July 2026. */
export function fiscalYearLabel(date: Date): string {
  const start = fiscalYearStart(date);
  const from = String(start.getFullYear()).slice(-2);
  const to = String(start.getFullYear() + 1).slice(-2);
  return `FY ${from}/${to}`;
}

// ============================================================================
// Timeline tiers — the axis granularity shared by the roadmap's zoom levels.
// ============================================================================

export type TimeTier = 'month' | 'quarter' | 'year';

/** Snaps `date` back to the start of its tier. */
export function tierStart(date: Date, tier: TimeTier): Date {
  if (tier === 'month') return startOfMonth(date);
  if (tier === 'quarter') return fiscalQuarterStart(date);
  return fiscalYearStart(date);
}

/** The start of the tier following the one containing `date`. */
export function tierNext(date: Date, tier: TimeTier): Date {
  const start = tierStart(date, tier);
  return addMonths(start, tier === 'month' ? 1 : tier === 'quarter' ? 3 : 12);
}

/** Tier-start Dates covering `start` through `end`, inclusive. */
export function eachTierBetween(start: Date, end: Date, tier: TimeTier): Date[] {
  const cells: Date[] = [];
  let cursor = tierStart(start, tier);
  const last = tierStart(end, tier);
  while (cursor <= last) {
    cells.push(cursor);
    cursor = tierNext(cursor, tier);
  }
  return cells;
}

/**
 * Axis label for a tier cell.
 * `showYear` appends the fiscal year, for the row that anchors the reader.
 * `compact` shrinks a month to its initial, for cells too narrow for 'Jul'.
 */
export function tierLabel(
  start: Date,
  tier: TimeTier,
  opts?: { showYear?: boolean; compact?: boolean }
): string {
  if (tier === 'year') return fiscalYearLabel(start);

  if (tier === 'quarter') {
    const quarter = `Q${fiscalQuarterOf(start)}`;
    return opts?.showYear ? `${quarter} ${fiscalYearLabel(start)}` : quarter;
  }

  const month = MONTH_ABBR[start.getMonth()];
  if (opts?.compact) return month[0];
  return opts?.showYear ? `${month} '${String(start.getFullYear()).slice(-2)}` : month;
}
