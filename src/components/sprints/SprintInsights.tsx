import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { Sprint, Ticket, Workspace } from '../../types/database';
import { useSprintEvents, useSprintReportTickets, ShippedTicket } from '../../hooks/useSprints';
import { buildBurndown } from '../../lib/sprintReport';
import { formatPoints } from '../../lib/storyPoints';
import { formatTicketIdentifier } from '../../lib/identifier';
import { BurndownChart } from './BurndownChart';

interface SprintInsightsProps {
  sprint: Sprint;
  /** The sprint's live tickets; only used to notice changes and refetch the log. */
  tickets: Ticket[];
  workspace: Workspace | null;
}

/** Burndown for a running or finished sprint, and the report once it is finished. */
export const SprintInsights: React.FC<SprintInsightsProps> = ({ sprint, tickets, workspace }) => {
  const started = sprint.status !== 'planned';
  const completed = sprint.status === 'completed';
  const { events, isLoading, error, refetch } = useSprintEvents(sprint.id, started);
  const { rows, isLoading: reportLoading, error: reportError } = useSprintReportTickets(sprint.id, completed);

  // A ticket edit writes a log row in the database but only invalidates ticket queries
  // here; watching the tickets is how the chart follows along without a reload.
  const signature = tickets.map(t => `${t.id}:${t.state_id}:${t.story_points ?? ''}`).join('|');
  const lastSignature = React.useRef(signature);
  React.useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    if (started && !completed) void refetch();
  }, [signature, started, completed, refetch]);

  const burndown = useMemo(() => buildBurndown(sprint, events), [sprint, events]);

  if (!started) return null;

  const report = completed ? summarise(rows) : null;
  const unitLabel = (n: number) =>
    burndown.unit === 'points' ? formatPoints(n) : `${n} ticket${n === 1 ? '' : 's'}`;

  return (
    <>
      <div className="bg-bg-surface-raised rounded-lg p-4 sm:p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-primary">Burndown</span>
          <span className="text-[11px] text-text-tertiary">
            {burndown.unit === 'points' ? 'Story points' : 'Tickets (nothing estimated)'}
          </span>
        </div>
        {error ? (
          <p className="text-xs text-status-error">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="flex items-center gap-2 text-xs text-text-tertiary">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading history…
          </p>
        ) : events.length === 0 ? (
          <p className="text-xs text-text-tertiary">No history recorded for this sprint yet.</p>
        ) : (
          <>
            <BurndownChart burndown={burndown} />
            <p className="text-[11px] text-text-secondary">
              Started with {unitLabel(burndown.startScope)}
              {burndown.added > 0 && (
                <span className="text-status-warning"> · {unitLabel(burndown.added)} added mid-sprint</span>
              )}
              {burndown.removed > 0 && <span> · {unitLabel(burndown.removed)} removed</span>}
            </p>
          </>
        )}
      </div>

      {completed && (
        <div className="bg-bg-surface-raised rounded-lg p-4 sm:p-5 space-y-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-primary">Sprint report</span>

          {sprint.goal && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Goal</p>
              <p className="text-xs text-text-primary mt-0.5">{sprint.goal}</p>
            </div>
          )}

          {reportError ? (
            <p className="text-xs text-status-error">{(reportError as Error).message}</p>
          ) : reportLoading || !report ? (
            <p className="flex items-center gap-2 text-xs text-text-tertiary">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading report…
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Committed" value={sprint.committed_points != null ? formatPoints(sprint.committed_points) : '—'} />
                <Stat label="Delivered" value={formatPoints(report.deliveredPoints)} />
                <Stat
                  label="Say / do"
                  value={sprint.committed_points
                    ? `${Math.round((report.deliveredPoints / sprint.committed_points) * 100)}%`
                    : '—'}
                />
                <Stat label="Added mid-sprint" value={unitLabel(burndown.added)} />
              </div>
              {report.unfinished > 0 && (
                <p className="text-[11px] text-text-secondary">
                  {report.unfinished} unfinished ticket{report.unfinished === 1 ? '' : 's'}
                  {report.unfinishedPoints > 0 && ` (${formatPoints(report.unfinishedPoints)})`} carried
                  over or returned to the backlog.
                </p>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5">
                  Shipped · {report.shipped.length}
                </p>
                {report.shipped.length === 0 ? (
                  <p className="text-xs text-text-tertiary">Nothing was completed in this sprint.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md bg-bg-surface">
                    {report.shipped.map(r => (
                      <li key={r.ticket_id} className="flex items-center gap-2 px-3 py-2 text-xs">
                        <span className="font-mono text-[10px] text-text-tertiary shrink-0">
                          {r.ticket ? formatTicketIdentifier(r.ticket, workspace) : ''}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-text-primary">
                          {r.ticket?.title ?? 'Deleted ticket'}
                        </span>
                        {r.story_points != null && (
                          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-text-secondary">
                            {r.story_points}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-md bg-bg-surface-hover px-3 py-2">
    <p className="text-base font-semibold text-text-primary tabular-nums">{value}</p>
    <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</p>
  </div>
);

function summarise(rows: ShippedTicket[]) {
  const shipped = rows.filter(r => r.outcome === 'completed');
  const unfinished = rows.filter(r => r.outcome === 'carried_over' || r.outcome === 'returned_to_backlog');
  return {
    shipped,
    deliveredPoints: shipped.reduce((s, r) => s + (r.story_points ?? 0), 0),
    unfinished: unfinished.length,
    unfinishedPoints: unfinished.reduce((s, r) => s + (r.story_points ?? 0), 0),
  };
}
