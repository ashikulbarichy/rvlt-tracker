import type { Ticket } from '../types/database';
import { takesPoints } from './storyPoints';

/** What makes a backlog ticket not ready to plan. */
export type GroomingFlag = 'needs_estimate' | 'too_big' | 'no_criteria';

export const GROOMING_LABEL: Record<GroomingFlag, string> = {
  needs_estimate: 'Needs estimate',
  too_big: 'Too big to plan',
  no_criteria: 'No acceptance criteria',
};

/** 13 is the top of the scale: a story that size is split before it goes into a sprint. */
export const SPLIT_AT = 13;

export function groomingFlags(ticket: Pick<Ticket, 'story_points' | 'acceptance_criteria'> & { type?: Ticket['type'] }): GroomingFlag[] {
  const flags: GroomingFlag[] = [];
  const pointed = takesPoints(ticket);
  if (pointed && ticket.story_points == null) flags.push('needs_estimate');
  if (pointed && (ticket.story_points ?? 0) >= SPLIT_AT) flags.push('too_big');
  if (!ticket.acceptance_criteria || ticket.acceptance_criteria.length === 0) flags.push('no_criteria');
  return flags;
}

export const isReady = (ticket: Parameters<typeof groomingFlags>[0]) => groomingFlags(ticket).length === 0;
