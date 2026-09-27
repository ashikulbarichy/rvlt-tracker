import React from 'react';
import type { Burndown } from '../../lib/sprintReport';

const W = 600;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 22, left: 30 };

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/**
 * Remaining work per day against the ideal line, with scope drawn behind it so added
 * work shows as the gap growing. Plain SVG: no chart library for three lines.
 */
export const BurndownChart: React.FC<{ burndown: Burndown }> = ({ burndown }) => {
  const { days, unit } = burndown;
  const max = Math.max(1, burndown.startScope, ...days.map(d => d.scope ?? 0), ...days.map(d => d.remaining ?? 0));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (days.length <= 1 ? 0 : (i * innerW) / (days.length - 1));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = (pick: (d: Burndown['days'][number]) => number | null) =>
    days
      .map((d, i) => ({ v: pick(d), i }))
      .filter((p): p is { v: number; i: number } => p.v != null)
      .map((p, n) => `${n === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(' ');

  const ticks = [0, Math.round(max / 2), max];
  const labelDays = days.length <= 3 ? days.map((_, i) => i) : [0, Math.floor((days.length - 1) / 2), days.length - 1];
  const today = days.reduce((last, d, i) => (d.remaining != null ? i : last), -1);

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Burndown in ${unit}`}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-text-tertiary)">{t}</text>
          </g>
        ))}
        {labelDays.map(i => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'} fontSize={10} fill="var(--color-text-tertiary)">
            {shortDate(days[i].date)}
          </text>
        ))}
        <path d={line(d => d.ideal)} fill="none" stroke="var(--color-text-tertiary)" strokeWidth={1.5} strokeDasharray="4 4" />
        <path d={line(d => d.scope)} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.5} />
        <path d={line(d => d.remaining)} fill="none" stroke="var(--color-accent-primary)" strokeWidth={2.5} strokeLinejoin="round" />
        {today >= 0 && days[today].remaining != null && (
          <circle cx={x(today)} cy={y(days[today].remaining as number)} r={3.5} fill="var(--color-accent-primary)" />
        )}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-accent-primary rounded" />Remaining</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: 'var(--color-border-strong)' }} />Scope</span>
        <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-text-tertiary" />Ideal</span>
      </div>
    </div>
  );
};
