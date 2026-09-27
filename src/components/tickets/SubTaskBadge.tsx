import React from 'react';
import { GitBranch } from 'lucide-react';
import type { SubTaskCount } from '../../hooks/useSprints';

/** "1/3" sub-tasks done. Nothing for a ticket without sub-tasks. */
export const SubTaskBadge: React.FC<{ count?: SubTaskCount; className?: string }> = ({ count, className = '' }) => {
  if (!count || count.total === 0) return null;
  return (
    <span
      title={`Sub-tasks: ${count.done} of ${count.total} done`}
      className={`inline-flex items-center gap-1 h-[18px] px-1.5 rounded-full bg-bg-surface-hover text-[10px] font-medium tabular-nums text-text-secondary shrink-0 ${className}`}
    >
      <GitBranch className="w-3 h-3" />
      {count.done}/{count.total}
    </span>
  );
};
