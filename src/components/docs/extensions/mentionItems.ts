// Pure helpers for the `@` menu: what it offers for a query, and how dates read.
// No TipTap or React in here, so the parsing can be exercised on its own.

import type { LinkableDoc } from './DocLink';

export interface MentionablePerson {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export type MentionItem =
  | { kind: 'person'; person: MentionablePerson }
  | { kind: 'date'; date: string; hint: string }
  | { kind: 'pickDate' }
  | { kind: 'doc'; doc: LinkableDoc };

const MAX_PEOPLE = 5;
const MAX_DATES = 4;
const MAX_DOCS = 5;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar date as YYYY-MM-DD. Never toISOString(): that is UTC and shifts the day. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD to a local-midnight Date, or null if it is not a real calendar date. */
export function parseIsoDate(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso || '');
  if (!m) return null;
  return makeDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function makeDate(year: number, monthIndex: number, day: number): Date | null {
  const d = new Date(year, monthIndex, day);
  // new Date rolls 31 Feb over into March; a rolled date is not what was typed.
  if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) return null;
  return d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Whole calendar days from `from` to `to`; rounding absorbs DST's 23- and 25-hour days. */
function dayDiff(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/**
 * How a date chip reads. The year is dropped for the current year, the way people write
 * dates in running text, and kept otherwise so an old note stays unambiguous.
 */
export function formatDocDate(iso: string, today: Date = new Date()): string {
  const d = parseIsoDate(iso);
  if (!d) return iso || 'Invalid date';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** The full form, always with the year: stored as the fallback text, shown as the tooltip. */
export function formatDocDateLong(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso || 'Invalid date';
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/** "Today", "Tomorrow", "in 3 days", "2 weeks ago" — the right-hand hint in the menu. */
export function relativeHint(iso: string, today: Date = new Date()): string {
  const d = parseIsoDate(iso);
  if (!d) return '';
  const diff = dayDiff(today, d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const abs = Math.abs(diff);
  const span = abs < 14
    ? `${abs} days`
    : abs < 60 ? `${Math.round(abs / 7)} weeks` : `${Math.round(abs / 30)} months`;
  return diff > 0 ? `in ${span}` : `${span} ago`;
}

function monthFromWord(word: string): number | null {
  if (word.length < 3) return null;
  const index = MONTHS.findIndex(m => m.startsWith(word));
  return index === -1 ? null : index;
}

/**
 * A day and month with no year. The current year, unless that lands more than about
 * six months back, in which case the next: "jan5" typed in December means the coming one.
 */
function resolveMonthDay(monthIndex: number, day: number, today: Date): Date | null {
  const thisYear = makeDate(today.getFullYear(), monthIndex, day);
  if (!thisYear) return null;
  if (dayDiff(today, thisYear) < -182) return makeDate(today.getFullYear() + 1, monthIndex, day);
  return thisYear;
}

/**
 * Dates a query could mean. The `@` menu stops at the first space, so every form here is
 * one word: `today`, `tom`, `fri`, `3d`, `2w`, `-1w`, `oct5`, `5oct`, `2026-10-05`.
 */
export function parseDateQuery(query: string, today: Date = new Date()): Date[] {
  const q = query.trim().toLowerCase();
  const base = startOfDay(today);
  const out: Date[] = [];

  if (!q) return [base, addDays(base, 1)];

  const keywords: [string, number][] = [['today', 0], ['tomorrow', 1], ['yesterday', -1]];
  for (const [word, offset] of keywords) {
    if (word.startsWith(q)) out.push(addDays(base, offset));
  }

  // Weekday names: the next one strictly after today. Today itself is already "today".
  if (q.length >= 2) {
    WEEKDAYS.forEach((name, index) => {
      if (!name.startsWith(q)) return;
      const ahead = ((index - base.getDay() + 7) % 7) || 7;
      out.push(addDays(base, ahead));
    });
  }

  const relative = /^([+-]?)(\d{1,3})(d|w|m)$/.exec(q);
  if (relative) {
    const sign = relative[1] === '-' ? -1 : 1;
    const n = Number(relative[2]) * sign;
    if (relative[3] === 'd') out.push(addDays(base, n));
    if (relative[3] === 'w') out.push(addDays(base, n * 7));
    if (relative[3] === 'm') {
      // Clamp to the month's last day: one month from 31 Jan is 28/29 Feb, not 3 Mar.
      const target = new Date(base.getFullYear(), base.getMonth() + n, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      out.push(new Date(target.getFullYear(), target.getMonth(), Math.min(base.getDate(), lastDay)));
    }
  }

  const iso = parseIsoDate(q);
  if (iso) out.push(iso);

  const monthFirst = /^([a-z]{3,9})(\d{1,2})$/.exec(q);
  const dayFirst = /^(\d{1,2})([a-z]{3,9})$/.exec(q);
  const monthDay = monthFirst
    ? { month: monthFromWord(monthFirst[1]), day: Number(monthFirst[2]) }
    : dayFirst
      ? { month: monthFromWord(dayFirst[2]), day: Number(dayFirst[1]) }
      : null;
  if (monthDay && monthDay.month !== null) {
    const d = resolveMonthDay(monthDay.month, monthDay.day, base);
    if (d) out.push(d);
  }

  const seen = new Set<string>();
  return out.filter(d => {
    const key = toIsoDate(d);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wantsPicker(q: string): boolean {
  return !q || ['date', 'pick', 'calendar'].some(word => word.startsWith(q));
}

/**
 * Everything the `@` menu offers for a query, grouped people → dates → documents.
 * `people` and `docs` must already be limited to what the author may see; this only
 * filters and orders.
 */
export function buildMentionItems(args: {
  query: string;
  people: MentionablePerson[];
  docs: LinkableDoc[];
  today?: Date;
}): MentionItem[] {
  const today = args.today || new Date();
  const q = args.query.trim().toLowerCase();

  const people: MentionItem[] = args.people
    .filter(p => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    .slice(0, MAX_PEOPLE)
    .map(person => ({ kind: 'person', person }));

  const dates: MentionItem[] = parseDateQuery(q, today)
    .slice(0, MAX_DATES)
    .map(d => {
      const date = toIsoDate(d);
      return { kind: 'date', date, hint: relativeHint(date, today) };
    });
  if (wantsPicker(q)) dates.push({ kind: 'pickDate' });

  const docs: MentionItem[] = args.docs
    .filter(doc => !q || (doc.title || 'Untitled').toLowerCase().includes(q))
    .slice(0, MAX_DOCS)
    .map(doc => ({ kind: 'doc', doc }));

  return [...people, ...dates, ...docs];
}
