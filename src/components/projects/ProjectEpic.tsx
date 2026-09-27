import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { StateCategory } from '../../types/database';
import { buildBurnup, BurnupDay } from '../../lib/sprintReport';
import { formatPoints, takesPoints } from '../../lib/storyPoints';

interface EpicTicket {
  id: string;
  story_points: number | null;
  parent_id: string | null;
  created_at: string;
  closed_at: string | null;
  status: { category: StateCategory } | null;
  type: { takes_story_points: boolean } | null;
}

/** A project read as an epic: its points, how many are done, and a burn-up. */
export const ProjectEpic: React.FC<{ projectId: string; targetDate?: string | null }> = ({ projectId, targetDate }) => {
  const { data, isLoading, error } = useQuery({
    // Under ['tickets'] so every ticket mutation keeps it fresh.
    queryKey: ['tickets', 'epic', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, story_points, parent_id, created_at, closed_at, status:state_id(category), type:type_id(takes_story_points)')
        .eq('project_id', projectId)
        .is('deleted_at', null);
      if (error) throw error;
      return (data || []) as unknown as EpicTicket[];
    },
  });

  const summary = useMemo(() => {
    const rows = data ?? [];
    let total = 0;
    let done = 0;
    let unestimated = 0;
    for (const t of rows) {
      if (!takesPoints(t) || t.status?.category === 'canceled') continue;
      if (t.story_points == null) {
        if (t.status?.category !== 'completed') unestimated += 1;
        continue;
      }
      total += t.story_points;
      if (t.status?.category === 'completed') done += t.story_points;
    }
    const burnup = buildBurnup(
      rows.filter(t => takesPoints(t)).map(t => ({
        story_points: t.story_points,
        created_at: t.created_at,
        closed_at: t.closed_at,
        category: t.status?.category,
      })),
    );
    return { total, done, unestimated, burnup };
  }, [data]);

  if (error) {
    return <p className="text-xs text-status-error">{(error as Error).message}</p>;
  }
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-text-tertiary">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading epic…
      </p>
    );
  }
  if (summary.total === 0 && summary.unestimated === 0) return null;

  const percent = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-text-primary uppercase tracking-wider">
          <TrendingUp className="w-4 h-4 text-text-secondary" /> Epic progress
        </h3>
        <span className="text-xs text-text-secondary tabular-nums">
          {summary.done} of {formatPoints(summary.total)} · {percent}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-bg-surface-hover rounded-full overflow-hidden">
        <div className="h-full bg-accent-primary" style={{ width: `${percent}%` }} />
      </div>
      {summary.unestimated > 0 && (
        <p className="text-[11px] text-status-warning">
          {summary.unestimated} open ticket{summary.unestimated === 1 ? '' : 's'} not estimated yet, so not in these totals.
        </p>
      )}
      {summary.burnup.length > 1 && <BurnupChart days={summary.burnup} targetDate={targetDate} />}
    </div>
  );
};

const W = 600;
const H = 160;
const PAD = { top: 10, right: 10, bottom: 20, left: 30 };

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Done climbing toward scope; the gap is the work left. */
const BurnupChart: React.FC<{ days: BurnupDay[]; targetDate?: string | null }> = ({ days, targetDate }) => {
  const max = Math.max(1, ...days.map(d => d.scope));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i * innerW) / (days.length - 1);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const path = (pick: (d: BurnupDay) => number) =>
    days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pick(d)).toFixed(1)}`).join(' ');
  const area = `${path(d => d.done)} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  return (
    <div className="space-y-1.5 rounded-md bg-bg-surface-raised p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Epic burn-up">
        {[0, max].map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-text-tertiary)">{t}</text>
          </g>
        ))}
        <text x={PAD.left} y={H - 5} fontSize={10} fill="var(--color-text-tertiary)">{shortDate(days[0].date)}</text>
        <text x={W - PAD.right} y={H - 5} textAnchor="end" fontSize={10} fill="var(--color-text-tertiary)">
          {shortDate(days[days.length - 1].date)}
        </text>
        <path d={area} fill="var(--color-accent-primary)" opacity={0.12} />
        <path d={path(d => d.scope)} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.5} />
        <path d={path(d => d.done)} fill="none" stroke="var(--color-accent-primary)" strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-accent-primary rounded" />Done</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: 'var(--color-border-strong)' }} />Scope</span>
        {targetDate && <span>Target {shortDate(targetDate)}</span>}
        <span>Uses today&apos;s estimates</span>
      </div>
    </div>
  );
};
