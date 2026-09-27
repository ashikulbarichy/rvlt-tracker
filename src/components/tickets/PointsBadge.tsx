import React from 'react';
import { takesPoints } from '../../lib/storyPoints';

interface PointsBadgeProps {
  ticket: { story_points?: number | null; type?: { takes_story_points?: boolean } | null };
  className?: string;
}

/** The ticket's estimate as a small pill. Nothing for unestimated tickets or bugs. */
export const PointsBadge: React.FC<PointsBadgeProps> = ({ ticket, className = '' }) => {
  if (!takesPoints(ticket) || ticket.story_points == null) return null;
  return (
    <span
      title={`${ticket.story_points} story point${ticket.story_points === 1 ? '' : 's'}`}
      className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-bg-surface-hover text-[10px] font-semibold tabular-nums text-text-secondary shrink-0 ${className}`}
    >
      {ticket.story_points}
    </span>
  );
};
