/**
 * Backlog order is a float per ticket, lowest first. Moving a ticket sets it to the
 * midpoint of its new neighbours, so a move is one write. Halving runs out of precision
 * after ~50 moves into the same gap; below MIN_GAP the caller renumbers the whole list.
 */
export const RANK_STEP = 1024;
const MIN_GAP = 1e-6;

/** The rank for a ticket dropped between `before` and `after` (either may be missing). */
export function rankBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return RANK_STEP;
  if (before == null) return (after as number) - RANK_STEP;
  if (after == null) return before + RANK_STEP;
  return (before + after) / 2;
}

export function gapTooSmall(before: number | null, after: number | null): boolean {
  return before != null && after != null && Math.abs(after - before) < MIN_GAP;
}

/** Moves `items[from]` to index `to` and returns the new order. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
