import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, GripVertical, Loader2 } from 'lucide-react';
import type { Ticket } from '../../types/database';
import { useApp } from '../../context/AppContext';
import { useTeams } from '../../hooks/useTeams';
import { useRankBacklog, useTeamBacklog, useTeamSubTaskCounts } from '../../hooks/useSprints';
import { gapTooSmall, rankBetween, RANK_STEP, reorder } from '../../lib/backlogRank';
import { GROOMING_LABEL, GroomingFlag, groomingFlags } from '../../lib/grooming';
import { formatPoints, sumPoints } from '../../lib/storyPoints';
import { formatTicketIdentifier } from '../../lib/identifier';
import { SidebarToggle } from '../layout/SidebarToggle';
import { PointsBadge } from '../tickets/PointsBadge';
import { CriteriaBadge } from '../tickets/CriteriaBadge';
import { SubTaskBadge } from '../tickets/SubTaskBadge';

type Filter = 'all' | 'ready' | GroomingFlag;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'needs_estimate', label: GROOMING_LABEL.needs_estimate },
  { id: 'too_big', label: GROOMING_LABEL.too_big },
  { id: 'no_criteria', label: GROOMING_LABEL.no_criteria },
];

const matchesFilter = (ticket: Ticket, filter: Filter) => {
  if (filter === 'all') return true;
  const flags = groomingFlags(ticket);
  return filter === 'ready' ? flags.length === 0 : flags.includes(filter);
};

/**
 * A team's backlog in priority order, for grooming: drag (or the arrows) to rank, and
 * filters for what is not ready to plan yet. Sprint planning takes from the top of it.
 */
export const BacklogView: React.FC = () => {
  const { teamId, workspaceSlug } = useParams<{ teamId: string; workspaceSlug: string }>();
  const navigate = useNavigate();
  const { currentWorkspace, setSelectedTicket } = useApp();
  const { teams } = useTeams(currentWorkspace?.id);
  const team = (teams || []).find(t => t.id === teamId);

  const { tickets, isLoading, error } = useTeamBacklog(teamId);
  const { rank, isRanking } = useRankBacklog(teamId);
  const { counts: subTaskCounts } = useTeamSubTaskCounts(teamId);

  const [filter, setFilter] = useState<Filter>('all');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [rankError, setRankError] = useState<string | null>(null);

  const visible = tickets.filter(t => matchesFilter(t, filter));
  const counts = Object.fromEntries(
    FILTERS.map(f => [f.id, tickets.filter(t => matchesFilter(t, f.id)).length]),
  ) as Record<Filter, number>;
  const totals = sumPoints(visible);

  /** Writes the moved ticket's new place; renumbers the list when the gap is spent. */
  const move = async (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= visible.length) return;
    const next = reorder(visible, from, to);
    const before = to > 0 ? next[to - 1].backlog_rank : null;
    const after = to < next.length - 1 ? next[to + 1].backlog_rank : null;
    const writes = gapTooSmall(before, after)
      ? next.map((t, i) => ({ id: t.id, backlog_rank: (i + 1) * RANK_STEP }))
      : [{ id: next[to].id, backlog_rank: rankBetween(before, after) }];
    setRankError(null);
    try {
      await rank(writes);
    } catch (e) {
      setRankError(e instanceof Error ? e.message : 'The new order could not be saved.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-3 sm:px-6 pt-2.5 sm:pt-3 pb-8 space-y-5">
        <div className="flex items-center gap-2.5">
          <SidebarToggle />
          <button
            type="button"
            onClick={() => navigate(`/${workspaceSlug}/sprints`)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors focus:outline-none"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Sprints
          </button>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold text-text-primary">
            Backlog{team ? <span className="text-text-tertiary font-normal"> · {team.name}</span> : null}
          </h1>
          <span className="text-xs text-text-secondary tabular-nums">
            {visible.length} ticket{visible.length === 1 ? '' : 's'} · {formatPoints(totals.points)}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors focus:outline-none ${
                filter === f.id
                  ? 'bg-accent-primary text-button-text'
                  : 'bg-bg-surface-raised text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
              }`}
            >
              {f.label} <span className="opacity-70 tabular-nums">{counts[f.id]}</span>
            </button>
          ))}
        </div>

        {filter !== 'all' && (
          <p className="text-[11px] text-text-tertiary">
            Reordering here places a ticket among the ones shown; hidden tickets keep their place.
          </p>
        )}

        {rankError && (
          <p className="text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
            {rankError}
          </p>
        )}

        {error ? (
          <p className="text-xs text-status-error">{(error as Error).message}</p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading backlog…
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-text-tertiary">
            {filter === 'all' ? 'No open tickets outside a sprint.' : 'Nothing matches this filter.'}
          </p>
        ) : (
          <ol className="rounded-lg bg-bg-surface-raised divide-y divide-border">
            {visible.map((ticket, index) => {
              const flags = groomingFlags(ticket);
              return (
                <li
                  key={ticket.id}
                  draggable={!isRanking}
                  onDragStart={e => {
                    setDragId(ticket.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', ticket.id);
                  }}
                  onDragOver={e => {
                    if (!dragId) return;
                    e.preventDefault();
                    setOverIndex(index);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverIndex(null);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    const from = visible.findIndex(t => t.id === dragId);
                    setDragId(null);
                    setOverIndex(null);
                    void move(from, index);
                  }}
                  className={`group flex items-center gap-2 px-2 sm:px-3 py-2 transition-colors ${
                    dragId === ticket.id ? 'opacity-40' : ''
                  } ${overIndex === index && dragId !== ticket.id ? 'bg-bg-surface-hover' : 'hover:bg-bg-surface-hover/60'}`}
                >
                  <span className="hidden sm:block cursor-grab active:cursor-grabbing text-text-tertiary" aria-hidden="true">
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                  <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-text-tertiary">{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(ticket)}
                    className="flex-1 min-w-0 text-left focus:outline-none"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-text-tertiary shrink-0">
                        {formatTicketIdentifier(ticket, currentWorkspace)}
                      </span>
                      <span className="text-xs text-text-primary truncate">{ticket.title}</span>
                    </span>
                    {flags.length > 0 && (
                      <span className="flex flex-wrap gap-1 mt-1">
                        {flags.map(f => (
                          <span key={f} className="px-1.5 py-px rounded-full bg-status-warning/10 text-[10px] text-status-warning">
                            {GROOMING_LABEL[f]}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                  <SubTaskBadge count={subTaskCounts.get(ticket.id)} className="hidden sm:inline-flex" />
                  <CriteriaBadge criteria={ticket.acceptance_criteria} className="hidden sm:inline-flex" />
                  <PointsBadge ticket={ticket} />
                  <span className="flex flex-col shrink-0">
                    <button
                      type="button"
                      title="Move up"
                      disabled={index === 0 || isRanking}
                      onClick={() => void move(index, index - 1)}
                      className="p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-30 focus:outline-none"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={index === visible.length - 1 || isRanking}
                      onClick={() => void move(index, index + 1)}
                      className="p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-30 focus:outline-none"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
