import type { Sprint, SprintTicketEvent, StateCategory } from '../types/database';

/**
 * Sprint reports, derived from sprint_ticket_events.
 *
 * Every event is a ticket's full standing at one moment, so the state of the sprint at
 * any time is the latest event per ticket up to that time. Pure functions: the charts and
 * the report only lay out what these return.
 */

/** Points, or ticket counts when nothing in the sprint was estimated. */
export type BurnUnit = 'points' | 'tickets';

export interface BurndownDay {
  /** yyyy-mm-dd */
  date: string;
  /** Open work at the end of the day; null for days that have not happened yet. */
  remaining: number | null;
  /** Everything in the sprint that day except canceled work. */
  scope: number | null;
  /** The straight line from the starting scope to zero on the last day. */
  ideal: number;
}

export interface ScopeChange {
  ticketId: string;
  /** Positive when added, negative when removed. */
  delta: number;
  at: string;
}

export interface Burndown {
  unit: BurnUnit;
  days: BurndownDay[];
  /** Scope when the sprint started (or at the first recorded moment after). */
  startScope: number;
  /** Tickets that joined or left after the start, with their weight. */
  changes: ScopeChange[];
  added: number;
  removed: number;
}

interface Standing {
  inSprint: boolean;
  points: number | null;
  category: StateCategory;
}

const isOpen = (c: StateCategory) => c !== 'completed' && c !== 'canceled';

const weigh = (s: Standing, unit: BurnUnit) => (unit === 'points' ? s.points ?? 0 : 1);

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function totals(standings: Map<string, Standing>, unit: BurnUnit) {
  let remaining = 0;
  let scope = 0;
  standings.forEach(s => {
    if (!s.inSprint || s.category === 'canceled') return;
    const w = weigh(s, unit);
    scope += w;
    if (isOpen(s.category)) remaining += w;
  });
  return { remaining, scope };
}

export function buildBurndown(
  sprint: Pick<Sprint, 'start_date' | 'end_date' | 'started_at' | 'completed_at'>,
  events: SprintTicketEvent[],
  now: Date = new Date(),
): Burndown {
  const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const unit: BurnUnit = sorted.some(e => e.story_points != null) ? 'points' : 'tickets';

  const standings = new Map<string, Standing>();
  let cursor = 0;
  const applyUntil = (limit: number) => {
    while (cursor < sorted.length && new Date(sorted[cursor].occurred_at).getTime() <= limit) {
      const e = sorted[cursor];
      standings.set(e.ticket_id, { inSprint: e.in_sprint, points: e.story_points, category: e.category });
      cursor += 1;
    }
  };

  // The start: the moment the sprint began, else the start of its first day.
  const startAt = sprint.started_at ? new Date(sprint.started_at).getTime() : toDate(sprint.start_date).getTime();
  applyUntil(startAt);
  // A sprint started before the log existed has nothing yet; its first rows stand in.
  if (standings.size === 0 && sorted.length > 0) {
    applyUntil(new Date(sorted[0].occurred_at).getTime());
  }
  const startScope = totals(standings, unit).scope;
  const afterStart = cursor;

  // Scope changes: every in/out flip or re-estimate after the start, per ticket.
  const changes: ScopeChange[] = [];
  const replay = new Map(standings);
  for (let i = afterStart; i < sorted.length; i += 1) {
    const e = sorted[i];
    const before = replay.get(e.ticket_id);
    const next: Standing = { inSprint: e.in_sprint, points: e.story_points, category: e.category };
    const countedBefore = before && before.inSprint && before.category !== 'canceled' ? weigh(before, unit) : 0;
    const countedAfter = next.inSprint && next.category !== 'canceled' ? weigh(next, unit) : 0;
    // Only joining, leaving and re-estimating change scope; cancelling is closing work.
    const membershipOrSize =
      !before || before.inSprint !== next.inSprint || before.points !== next.points;
    if (membershipOrSize && countedAfter !== countedBefore) {
      changes.push({ ticketId: e.ticket_id, delta: countedAfter - countedBefore, at: e.occurred_at });
    }
    replay.set(e.ticket_id, next);
  }

  const first = toDate(sprint.start_date);
  const last = toDate(sprint.end_date);
  const span = Math.max(1, Math.round((last.getTime() - first.getTime()) / 86_400_000));
  const stopAt = sprint.completed_at ? new Date(sprint.completed_at).getTime() : now.getTime();

  const days: BurndownDay[] = [];
  for (let i = 0; i <= span; i += 1) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime() - 1;
    const ideal = Math.max(0, startScope - (startScope * i) / span);
    if (day.getTime() > stopAt) {
      days.push({ date: isoDay(day), remaining: null, scope: null, ideal });
      continue;
    }
    applyUntil(Math.min(dayEnd, stopAt));
    const t = totals(standings, unit);
    days.push({ date: isoDay(day), remaining: t.remaining, scope: t.scope, ideal });
  }

  return {
    unit,
    days,
    startScope,
    changes,
    added: changes.filter(c => c.delta > 0).reduce((s, c) => s + c.delta, 0),
    removed: changes.filter(c => c.delta < 0).reduce((s, c) => s - c.delta, 0),
  };
}

export interface BurnupTicket {
  story_points: number | null;
  created_at: string;
  closed_at: string | null;
  category?: StateCategory;
}

export interface BurnupDay {
  date: string;
  /** Points in the epic by that day (created and not canceled). */
  scope: number;
  /** Points finished by that day. */
  done: number;
}

/**
 * An epic's burn-up from ticket dates: scope grows when a ticket is created, done grows
 * when it closes. Projects have no history log, so today's estimates stand in for the
 * past and canceled tickets are left out entirely.
 */
export function buildBurnup(tickets: BurnupTicket[], now: Date = new Date(), maxDays = 120): BurnupDay[] {
  const counted = tickets.filter(t => t.category !== 'canceled' && t.story_points != null);
  if (counted.length === 0) return [];

  const dayOf = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const firstDay = Math.min(...counted.map(t => dayOf(t.created_at)));
  const span = Math.round((today - firstDay) / 86_400_000);
  // Long-running epics are sampled so the chart keeps a readable number of points.
  const step = Math.max(1, Math.ceil(span / maxDays));

  const days: BurnupDay[] = [];
  for (let i = 0; i <= span; i += step) {
    const start = new Date(firstDay);
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const end = day.getTime() + 86_400_000 - 1;
    let scope = 0;
    let done = 0;
    for (const t of counted) {
      if (new Date(t.created_at).getTime() > end) continue;
      scope += t.story_points as number;
      if (t.category === 'completed' && t.closed_at && new Date(t.closed_at).getTime() <= end) {
        done += t.story_points as number;
      }
    }
    days.push({ date: isoDay(day), scope, done });
  }
  if (days.length && days[days.length - 1].date !== isoDay(new Date(today))) {
    const t = totalsNow(counted);
    days.push({ date: isoDay(new Date(today)), ...t });
  }
  return days;
}

function totalsNow(tickets: BurnupTicket[]) {
  let scope = 0;
  let done = 0;
  for (const t of tickets) {
    scope += t.story_points as number;
    if (t.category === 'completed') done += t.story_points as number;
  }
  return { scope, done };
}
