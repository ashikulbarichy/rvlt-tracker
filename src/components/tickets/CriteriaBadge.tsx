import React from 'react';
import { ListChecks } from 'lucide-react';
import type { AcceptanceCriterion } from '../../types/database';

/** "2/5" acceptance criteria met. Nothing when the ticket has none. */
export const CriteriaBadge: React.FC<{ criteria?: AcceptanceCriterion[] | null; className?: string }> = ({ criteria, className = '' }) => {
  if (!criteria || criteria.length === 0) return null;
  const done = criteria.filter(c => c.done).length;
  const complete = done === criteria.length;
  return (
    <span
      title={`Acceptance criteria: ${done} of ${criteria.length} met`}
      className={`inline-flex items-center gap-1 h-[18px] px-1.5 rounded-full bg-bg-surface-hover text-[10px] font-medium tabular-nums shrink-0 ${
        complete ? 'text-status-success' : 'text-text-secondary'
      } ${className}`}
    >
      <ListChecks className="w-3 h-3" />
      {done}/{criteria.length}
    </span>
  );
};
