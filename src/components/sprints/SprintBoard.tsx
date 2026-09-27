import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Loader2, Users } from 'lucide-react';
import type { Profile, Ticket, WorkflowState } from '../../types/database';
import { useApp } from '../../context/AppContext';
import { sprintLabel, useSprintEvents, useSprints, useSprintTickets } from '../../hooks/useSprints';
import { useWorkflowStates } from '../../hooks/useWorkflowStates';
import { useProfiles } from '../../hooks/useProfiles';
import { useTickets } from '../../hooks/useTickets';
import { LinkedTicket, useBlockedTickets } from '../../hooks/useTicketBlocks';
import { formatTicketIdentifier } from '../../lib/identifier';
import { formatPoints, sumPoints } from '../../lib/storyPoints';
import { SidebarToggle } from '../layout/SidebarToggle';
import { PointsBadge } from '../tickets/PointsBadge';

const UNASSIGNED = '__unassigned__';

const personName = (p?: Profile) => p?.full_name || p?.email || 'Unknown';

const avatar = (p?: Profile) =>
  p?.avatar_url ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent(personName(p))}&background=282828&color=B3B3B3&rounded=true`;

/** Loads the sprint for either view, and the header they share. */
function useSprintPage() {
  const { sprintId, workspaceSlug } = useParams<{ sprintId: string; workspaceSlug: string }>();
  const navigate = useNavigate();
  const { sprints, isLoading, error } = useSprints();
  const sprint = (sprints || []).find(s => s.id === sprintId);
  const { tickets, isLoading: ticketsLoading, error: ticketsError } = useSprintTickets(sprint?.id);
  const { blocked } = useBlockedTickets(tickets.map(t => t.id));
  return {
    sprint,
    tickets,
    blocked,
    loading: isLoading || (!!sprint && ticketsLoading),
    error: error || ticketsError,
    back: () => navigate(`/${workspaceSlug}/sprints/${sprintId}`),
    go: (view: 'board' | 'standup') => navigate(`/${workspaceSlug}/sprints/${sprintId}/${view}`),
  };
}

const PageShell: React.FC<{
  title: string;
  onBack: () => void;
  loading: boolean;
  error: unknown;
  missing: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, onBack, loading, error, missing, actions, children }) => (
  <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
    <div className="shrink-0 px-3 sm:px-6 pt-2.5 sm:pt-3 pb-3 space-y-3">
      <div className="flex items-center gap-2.5">
        <SidebarToggle />
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors focus:outline-none"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Sprint
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        {actions}
      </div>
    </div>
    {loading ? (
      <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-text-tertiary" /></div>
    ) : error ? (
      <p className="px-6 text-xs text-status-error">{(error as Error).message}</p>
    ) : missing ? (
      <p className="px-6 text-xs text-text-tertiary">This sprint does not exist or you are not on its team.</p>
    ) : (
      children
    )}
  </div>
);

const ViewSwitch: React.FC<{ current: 'board' | 'standup'; go: (v: 'board' | 'standup') => void }> = ({ current, go }) => (
  <div className="flex rounded-full bg-bg-surface-raised p-0.5 text-[11px] font-medium">
    {(['board', 'standup'] as const).map(v => (
      <button
        key={v}
        type="button"
        onClick={() => go(v)}
        className={`px-3 py-1 rounded-full transition-colors focus:outline-none ${
          current === v ? 'bg-accent-primary text-button-text' : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        {v === 'board' ? 'Board' : 'Standup'}
      </button>
    ))}
  </div>
);

const BlockedMark: React.FC<{ blockers?: LinkedTicket[] }> = ({ blockers }) =>
  blockers && blockers.length > 0 ? (
    <span
      title={`Blocked by ${blockers.map(b => b.title).join(', ')}`}
      className="inline-flex items-center gap-1 text-[10px] font-medium text-status-error"
    >
      <Ban className="w-3 h-3" /> Blocked
    </span>
  ) : null;

/**
 * The active sprint as a board: status columns, optionally one row per person. Column
 * limits come from each status's wip_limit and are counted across the whole column.
 */
export const SprintBoardView: React.FC = () => {
  const { sprint, tickets, blocked, loading, error, back, go } = useSprintPage();
  const { currentWorkspace, setSelectedTicket } = useApp();
  const { workflowStates } = useWorkflowStates();
  const { profiles } = useProfiles();
  const { setTicketStatusAsync } = useTickets({ workspaceId: currentWorkspace?.id });

  const [byPerson, setByPerson] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const columns = useMemo(
    () => [...(workflowStates || [])].sort((a, b) => a.position - b.position),
    [workflowStates],
  );
  const people = useMemo(() => new Map((profiles || []).map(p => [p.id, p as Profile])), [profiles]);

  const lanes = useMemo(() => {
    if (!byPerson) return [{ id: 'all', label: '', person: undefined as Profile | undefined, tickets }];
    const groups = new Map<string, Ticket[]>();
    for (const t of tickets) {
      const key = t.assignee_id || UNASSIGNED;
      groups.set(key, [...(groups.get(key) || []), t]);
    }
    return Array.from(groups.entries())
      .map(([id, list]) => ({
        id,
        label: id === UNASSIGNED ? 'Unassigned' : personName(people.get(id)),
        person: people.get(id),
        tickets: list,
      }))
      .sort((a, b) => (a.id === UNASSIGNED ? 1 : b.id === UNASSIGNED ? -1 : a.label.localeCompare(b.label)));
  }, [byPerson, tickets, people]);

  const countIn = (state: WorkflowState) => tickets.filter(t => t.state_id === state.id).length;

  const drop = async (stateId: string) => {
    const ticket = tickets.find(t => t.id === dragId);
    setDragId(null);
    setOver(null);
    if (!ticket || ticket.state_id === stateId) return;
    const state = columns.find(c => c.id === stateId);
    setMoveError(null);
    try {
      await setTicketStatusAsync({
        id: ticket.id,
        workspace_id: ticket.workspace_id,
        state_id: stateId,
        status: state ? { id: state.id, name: state.name, color: state.color } : undefined,
      });
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : 'That ticket could not be moved.');
    }
  };

  return (
    <PageShell
      title={sprint ? `${sprintLabel(sprint)} board` : 'Sprint board'}
      onBack={back}
      loading={loading}
      error={error}
      missing={!sprint}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setByPerson(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors focus:outline-none ${
              byPerson ? 'bg-bg-surface-hover text-text-primary' : 'bg-bg-surface-raised text-text-secondary hover:text-text-primary'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> By person
          </button>
          <ViewSwitch current="board" go={go} />
        </div>
      }
    >
      {moveError && (
        <p className="mx-3 sm:mx-6 mb-2 text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">{moveError}</p>
      )}
      <div className="flex-1 overflow-auto px-3 sm:px-6 pb-6">
        <div className="min-w-max space-y-4">
          {/* Column headers, with limits */}
          <div className="flex gap-3 sticky top-0 z-10 bg-bg-surface pb-1">
            {byPerson && <div className="w-36 shrink-0" />}
            {columns.map(col => {
              const n = countIn(col);
              const overLimit = col.wip_limit != null && n > col.wip_limit;
              const points = sumPoints(tickets.filter(t => t.state_id === col.id)).points;
              return (
                <div
                  key={col.id}
                  className={`w-64 shrink-0 flex items-center justify-between gap-2 px-3 py-2 rounded-md ${
                    overLimit ? 'bg-status-error/10 border border-status-error/40' : 'bg-bg-surface-raised'
                  }`}
                  title={overLimit ? `Over its limit of ${col.wip_limit}` : undefined}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                    <span className="text-xs font-medium text-text-primary truncate">{col.name}</span>
                  </span>
                  <span className={`text-[10px] tabular-nums shrink-0 ${overLimit ? 'text-status-error font-semibold' : 'text-text-tertiary'}`}>
                    {points > 0 && `${formatPoints(points)} · `}
                    {col.wip_limit != null ? `${n}/${col.wip_limit}` : n}
                  </span>
                </div>
              );
            })}
          </div>

          {tickets.length === 0 && (
            <p className="text-xs text-text-tertiary">No tickets in this sprint yet.</p>
          )}

          {lanes.map(lane => (
            <div key={lane.id} className="flex gap-3">
              {byPerson && (
                <div className="w-36 shrink-0 pt-2 flex items-start gap-2 min-w-0">
                  {lane.id !== UNASSIGNED && <img src={avatar(lane.person)} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />}
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-text-primary truncate">{lane.label}</span>
                    <span className="block text-[10px] text-text-tertiary tabular-nums">
                      {lane.tickets.length} · {formatPoints(sumPoints(lane.tickets).points)}
                    </span>
                  </span>
                </div>
              )}
              {columns.map(col => {
                const cellKey = `${lane.id}:${col.id}`;
                const cards = lane.tickets.filter(t => t.state_id === col.id);
                return (
                  <div
                    key={col.id}
                    onDragOver={e => { if (dragId) { e.preventDefault(); setOver(cellKey); } }}
                    onDragLeave={e => { if (e.currentTarget === e.target) setOver(null); }}
                    onDrop={e => { e.preventDefault(); void drop(col.id); }}
                    className={`w-64 shrink-0 min-h-[56px] rounded-md p-1.5 space-y-1.5 transition-colors ${
                      over === cellKey ? 'bg-bg-surface-hover' : 'bg-black/10'
                    }`}
                  >
                    {cards.map(t => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={e => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); }}
                        onDragEnd={() => { setDragId(null); setOver(null); }}
                        onClick={() => setSelectedTicket(t)}
                        className={`p-2.5 rounded-md bg-bg-surface-raised hover:bg-bg-surface-hover cursor-pointer space-y-1.5 ${
                          blocked.has(t.id) ? 'ring-1 ring-status-error/50' : ''
                        } ${dragId === t.id ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono text-text-tertiary">{formatTicketIdentifier(t, currentWorkspace)}</span>
                          <PointsBadge ticket={t} />
                        </div>
                        <p className="text-xs font-medium text-text-primary line-clamp-2">{t.title}</p>
                        <BlockedMark blockers={blocked.get(t.id)} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
};

/**
 * The daily standup, per person: what they finished since the last working day, what
 * they are on now, and what is holding them up. "Finished" comes from the sprint log.
 */
export const SprintStandupView: React.FC = () => {
  const { sprint, tickets, blocked, loading, error, back, go } = useSprintPage();
  const { currentWorkspace, setSelectedTicket } = useApp();
  const { profiles } = useProfiles();
  const { events, error: eventsError } = useSprintEvents(sprint?.id, !!sprint && sprint.status !== 'planned');

  // Monday looks back over the weekend.
  const since = useMemo(() => {
    const now = new Date();
    const hours = now.getDay() === 1 ? 72 : 24;
    return new Date(now.getTime() - hours * 3_600_000);
  }, []);

  const finishedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of events) {
      if (e.in_sprint && e.category === 'completed' && new Date(e.occurred_at) >= since) ids.add(e.ticket_id);
    }
    return ids;
  }, [events, since]);

  const people = useMemo(() => new Map((profiles || []).map(p => [p.id, p as Profile])), [profiles]);

  const rows = useMemo(() => {
    const byPerson = new Map<string, { done: Ticket[]; doing: Ticket[]; blocked: Ticket[] }>();
    const slot = (id: string) => {
      if (!byPerson.has(id)) byPerson.set(id, { done: [], doing: [], blocked: [] });
      return byPerson.get(id)!;
    };
    for (const t of tickets) {
      const key = t.assignee_id || UNASSIGNED;
      const category = t.status?.category;
      if (category === 'completed' && finishedIds.has(t.id)) slot(key).done.push(t);
      if (category === 'started') slot(key).doing.push(t);
      if (blocked.has(t.id) && category !== 'completed' && category !== 'canceled') slot(key).blocked.push(t);
    }
    return Array.from(byPerson.entries())
      .map(([id, v]) => ({ id, person: people.get(id), label: id === UNASSIGNED ? 'Unassigned' : personName(people.get(id)), ...v }))
      .sort((a, b) => (a.id === UNASSIGNED ? 1 : b.id === UNASSIGNED ? -1 : a.label.localeCompare(b.label)));
  }, [tickets, finishedIds, blocked, people]);

  const item = (t: Ticket, extra?: React.ReactNode) => (
    <li key={t.id}>
      <button
        type="button"
        onClick={() => setSelectedTicket(t)}
        className="w-full flex items-center gap-2 px-2 py-1 rounded-sm text-left hover:bg-bg-surface-hover focus:outline-none"
      >
        <span className="text-[10px] font-mono text-text-tertiary shrink-0">{formatTicketIdentifier(t, currentWorkspace)}</span>
        <span className="flex-1 min-w-0 text-xs text-text-primary truncate">{t.title}</span>
        {extra}
      </button>
    </li>
  );

  const column = (title: string, list: Ticket[], empty: string, render?: (t: Ticket) => React.ReactNode) => (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-text-tertiary px-2 mb-1">{title} · {list.length}</p>
      {list.length === 0 ? (
        <p className="px-2 text-[11px] text-text-tertiary">{empty}</p>
      ) : (
        <ul>{list.map(t => item(t, render?.(t)))}</ul>
      )}
    </div>
  );

  return (
    <PageShell
      title={sprint ? `${sprintLabel(sprint)} standup` : 'Standup'}
      onBack={back}
      loading={loading}
      error={error || eventsError}
      missing={!sprint}
      actions={<ViewSwitch current="standup" go={go} />}
    >
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-8 space-y-3">
        <p className="text-[11px] text-text-tertiary">
          Finished since {since.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.
        </p>
        {rows.length === 0 ? (
          <p className="text-xs text-text-tertiary">Nothing finished, in progress or blocked right now.</p>
        ) : (
          rows.map(r => (
            <div key={r.id} className="rounded-lg bg-bg-surface-raised p-3 sm:p-4 space-y-3">
              <div className="flex items-center gap-2">
                {r.id !== UNASSIGNED && <img src={avatar(r.person)} alt="" className="w-6 h-6 rounded-full object-cover" />}
                <span className="text-sm font-medium text-text-primary">{r.label}</span>
                {r.blocked.length > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-status-error">
                    <Ban className="w-3.5 h-3.5" /> {r.blocked.length} blocked
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {column('Finished', r.done, 'Nothing since last standup.')}
                {column('In progress', r.doing, 'Nothing in progress.')}
                {column('Blocked', r.blocked, 'Nothing blocked.', t => (
                  <span className="shrink-0 text-[10px] text-status-error truncate max-w-[40%]">
                    {(blocked.get(t.id) || []).map(b => b.title).join(', ')}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </PageShell>
  );
};
