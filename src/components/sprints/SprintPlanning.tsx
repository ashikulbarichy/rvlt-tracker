import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Search } from 'lucide-react';
import { Sprint, Ticket } from '../../types/database';
import { useApp } from '../../context/AppContext';
import { useMoveTicketsToSprint, useTeamBacklog } from '../../hooks/useSprints';
import { formatTicketIdentifier } from '../../lib/identifier';

interface SprintPlanningProps {
  sprint: Sprint;
  sprintTickets: Ticket[];
}

/**
 * Planning: the team's backlog beside the sprint, and multi-select to move either way.
 *
 * No drag-and-drop — that is a new dependency, and select-then-move handles moving
 * twenty tickets at once better than twenty drags. A move is one statement, so if the
 * database refuses any ticket (another team's, say) it refuses the lot and says why.
 */
export const SprintPlanning: React.FC<SprintPlanningProps> = ({ sprint, sprintTickets }) => {
  const { currentWorkspace } = useApp();
  const { tickets: backlog, isLoading: backlogLoading, error: backlogError } = useTeamBacklog(sprint.team_id);
  const { moveTickets, isMoving } = useMoveTicketsToSprint();

  const [query, setQuery] = useState('');
  const [pickedBacklog, setPickedBacklog] = useState<Set<string>>(new Set());
  const [pickedSprint, setPickedSprint] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const matches = (ticket: Ticket) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      ticket.title.toLowerCase().includes(q) ||
      formatTicketIdentifier(ticket, currentWorkspace).toLowerCase().includes(q)
    );
  };

  // Derived during render: both lists are small, and memoising them around a closure
  // only bought a lint suppression.
  const visibleBacklog = backlog.filter(matches);
  // Closed tickets stay on the sprint as its record and are not moved back.
  const movableSprint = sprintTickets
    .filter(t => t.status?.category !== 'completed' && t.status?.category !== 'canceled')
    .filter(matches);

  const toggle = (set: Set<string>, setSet: (next: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const move = async (ids: string[], target: string | null, clear: () => void) => {
    setError(null);
    try {
      await moveTickets({ ticketIds: ids, sprintId: target });
      clear();
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setError(e?.message || 'Those tickets could not be moved.');
    }
  };

  const renderRow = (ticket: Ticket, picked: Set<string>, onToggle: () => void) => (
    <label
      key={ticket.id}
      className={`flex items-start gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
        picked.has(ticket.id) ? 'bg-bg-surface-hover' : 'hover:bg-bg-surface-hover/60'
      }`}
    >
      <input
        type="checkbox"
        checked={picked.has(ticket.id)}
        onChange={onToggle}
        className="mt-0.5 shrink-0 accent-[var(--color-accent-primary)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-text-tertiary shrink-0">
            {formatTicketIdentifier(ticket, currentWorkspace)}
          </span>
          {ticket.status && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: ticket.status.color }}
              title={ticket.status.name}
            />
          )}
        </span>
        <span className="block text-xs text-text-primary truncate">{ticket.title}</span>
        {ticket.project && (
          <span className="block text-[10px] text-text-tertiary truncate">{ticket.project.name}</span>
        )}
      </span>
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by title or identifier…"
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-bg-surface-raised border border-transparent rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary"
        />
      </div>

      {error && (
        <p className="text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Backlog */}
        <div className="rounded-lg border border-border bg-bg-surface-raised/30 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Team backlog · {visibleBacklog.length}
            </span>
            <button
              type="button"
              disabled={pickedBacklog.size === 0 || isMoving}
              onClick={() => move(Array.from(pickedBacklog), sprint.id, () => setPickedBacklog(new Set()))}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Add {pickedBacklog.size || ''} <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-1.5 max-h-[50vh] overflow-y-auto space-y-0.5">
            {backlogError ? (
              <p className="px-2 py-3 text-[11px] text-status-error">
                {(backlogError as Error).message}
              </p>
            ) : backlogLoading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-[11px] text-text-tertiary">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading backlog…
              </div>
            ) : visibleBacklog.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-text-tertiary">
                {query.trim() ? 'Nothing matches.' : 'No open tickets outside a sprint.'}
              </p>
            ) : (
              visibleBacklog.map(t => renderRow(t, pickedBacklog, () => toggle(pickedBacklog, setPickedBacklog, t.id)))
            )}
          </div>
        </div>

        {/* Sprint */}
        <div className="rounded-lg border border-border bg-bg-surface-raised/30 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
            <button
              type="button"
              disabled={pickedSprint.size === 0 || isMoving}
              onClick={() => move(Array.from(pickedSprint), null, () => setPickedSprint(new Set()))}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="w-3 h-3" /> Remove {pickedSprint.size || ''}
            </button>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              In sprint · {movableSprint.length} open
            </span>
          </div>
          <div className="p-1.5 max-h-[50vh] overflow-y-auto space-y-0.5">
            {movableSprint.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-text-tertiary">
                {query.trim() ? 'Nothing matches.' : 'No open tickets in this sprint yet.'}
              </p>
            ) : (
              movableSprint.map(t => renderRow(t, pickedSprint, () => toggle(pickedSprint, setPickedSprint, t.id)))
            )}
          </div>
        </div>
      </div>

      {isMoving && (
        <p className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <Loader2 className="w-3 h-3 animate-spin" /> Moving…
        </p>
      )}
    </div>
  );
};
