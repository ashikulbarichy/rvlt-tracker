import type { StoryPoints } from '../types/database';

/** The team's estimation scale. The database refuses anything else. */
export const STORY_POINT_SCALE: StoryPoints[] = [1, 2, 3, 5, 8, 13];

/** A sprint loaded past this share of the team's average velocity gets a warning. */
export const OVERLOAD_RATIO = 1.1;

interface Estimable {
  story_points?: number | null;
  /** Sub-tasks are never estimated: points live on the story. */
  parent_id?: string | null;
  type?: { takes_story_points?: boolean } | null;
}

/**
 * Whether a ticket is estimated in points at all. Bugs and sub-tasks are not. An unloaded type is
 * treated as estimable so a missing embed never hides a real estimate.
 */
export function takesPoints(ticket: Estimable): boolean {
  return !ticket.parent_id && ticket.type?.takes_story_points !== false;
}

export interface PointTotals {
  /** Sum of estimated points. */
  points: number;
  /** Tickets that take points but have none yet. */
  unestimated: number;
}

export function sumPoints(tickets: Estimable[]): PointTotals {
  let points = 0;
  let unestimated = 0;
  for (const ticket of tickets) {
    if (!takesPoints(ticket)) continue;
    if (ticket.story_points == null) unestimated += 1;
    else points += ticket.story_points;
  }
  return { points, unestimated };
}

export const formatPoints = (n: number) => `${n} pt${n === 1 ? '' : 's'}`;
