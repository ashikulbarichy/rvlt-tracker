import React from 'react';
import type { VelocityPoint } from '../../hooks/useSprints';
import { sprintLabel } from '../../hooks/useSprints';

/** Committed against completed points per sprint, with the average as a line. */
export const VelocityChart: React.FC<{ history: VelocityPoint[] }> = ({ history }) => {
  const max = Math.max(1, ...history.map(h => Math.max(h.committed ?? 0, h.completed)));
  const average = Math.round(history.reduce((s, h) => s + h.completed, 0) / history.length);

  return (
    <div className="space-y-2">
      <div className="relative h-32 flex items-end gap-3 sm:gap-5 border-b border-border px-1">
        <div
          className="absolute left-0 right-0 border-t border-dashed border-text-tertiary"
          style={{ bottom: `${(average / max) * 100}%` }}
          title={`Average ${average} pts`}
        />
        {history.map(h => (
          <div key={h.sprint.id} className="flex-1 h-full flex items-end justify-center gap-1 min-w-0" title={`${sprintLabel(h.sprint)}: ${h.completed} of ${h.committed ?? '?'} pts`}>
            <div
              className="w-1/3 max-w-[18px] rounded-t-sm"
              style={{ height: `${((h.committed ?? 0) / max) * 100}%`, background: 'var(--color-border-strong)' }}
            />
            <div
              className="w-1/3 max-w-[18px] rounded-t-sm bg-accent-primary"
              style={{ height: `${(h.completed / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 sm:gap-5 px-1">
        {history.map(h => (
          <div key={h.sprint.id} className="flex-1 min-w-0 text-center">
            <p className="text-[10px] text-text-tertiary truncate">{sprintLabel(h.sprint)}</p>
            <p className="text-[11px] text-text-secondary tabular-nums">{h.completed}/{h.committed ?? '–'}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--color-border-strong)' }} />Committed</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent-primary" />Completed</span>
        <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-text-tertiary" />Average {average} pts</span>
      </div>
    </div>
  );
};
