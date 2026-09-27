import React, { useState } from 'react';
import { Check, CornerUpLeft, GitBranch, Loader2, Plus } from 'lucide-react';
import type { Ticket, WorkflowState, Workspace } from '../../types/database';
import { useApp } from '../../context/AppContext';
import { useTickets } from '../../hooks/useTickets';
import { useTicketTypes } from '../../hooks/useTicketTypes';
import { fetchTicketForPanel, useSubTasks } from '../../hooks/useSprints';
import { formatTicketIdentifier } from '../../lib/identifier';

interface SubTasksProps {
  ticket: Ticket;
  states: WorkflowState[];
  workspace: Workspace | null;
}

const isClosed = (t: Ticket) => t.status?.category === 'completed' || t.status?.category === 'canceled';

/**
 * A story's sub-tasks: progress, a checkbox to finish one, and a quick add. On a
 * sub-task it shows the story instead -- there is only one level.
 */
export const SubTasks: React.FC<SubTasksProps> = ({ ticket, states, workspace }) => {
  const { setSelectedTicket } = useApp();
  const { subTasks, isLoading, error } = useSubTasks(ticket.parent_id ? undefined : ticket.id);
  const { createTicketAsync, setTicketStatusAsync } = useTickets({ workspaceId: ticket.workspace_id });
  const { defaultTicketType } = useTicketTypes();

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const doneState = states.find(s => s.category === 'completed');
  const openState = states.find(s => s.category === 'unstarted') || states.find(s => s.category === 'backlog');

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setActionError(null);
    try {
      await work();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : (e as { message?: string })?.message || 'That did not save.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (ticket.parent_id) {
    const parent = ticket.parent;
    return (
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <CornerUpLeft className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        <span className="shrink-0">Sub-task of</span>
        <button
          type="button"
          disabled={busy === 'parent'}
          onClick={() => run('parent', async () => setSelectedTicket(await fetchTicketForPanel(ticket.parent_id as string)))}
          className="min-w-0 truncate text-text-primary hover:underline focus:outline-none"
        >
          {parent ? `${formatTicketIdentifier(parent as unknown as Partial<Ticket>, workspace)} ${parent.title}` : 'its parent ticket'}
        </button>
        {actionError && <span className="text-status-error">{actionError}</span>}
      </div>
    );
  }

  const done = subTasks.filter(isClosed).length;

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    const ok = await run('add', () =>
      createTicketAsync({
        workspace_id: ticket.workspace_id,
        team_id: ticket.team_id,
        project_id: ticket.project_id,
        parent_id: ticket.id,
        title,
        priority: ticket.priority,
        type_id: defaultTicketType?.id || ticket.type_id,
        state_id: openState?.id,
      }),
    );
    if (ok) setDraft('');
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-primary uppercase tracking-wider">
          <GitBranch className="w-3.5 h-3.5 text-accent-primary" />
          Sub-tasks
        </h3>
        {subTasks.length > 0 && (
          <span className="text-[11px] tabular-nums text-text-tertiary">{done}/{subTasks.length} done</span>
        )}
      </div>

      {error ? (
        <p className="text-xs text-status-error">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="flex items-center gap-2 text-xs text-text-tertiary"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</p>
      ) : (
        <ul className="space-y-1">
          {subTasks.map(child => {
            const closed = isClosed(child);
            return (
              <li key={child.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-surface-hover/60">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={closed}
                  disabled={busy !== null || !doneState || !openState}
                  onClick={() =>
                    run(child.id, () =>
                      setTicketStatusAsync({
                        id: child.id,
                        workspace_id: child.workspace_id,
                        state_id: (closed ? openState : doneState)!.id,
                      } as Parameters<typeof setTicketStatusAsync>[0]),
                    )
                  }
                  className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                    closed ? 'bg-accent-primary border-accent-primary text-button-text' : 'border-border-strong hover:border-text-secondary'
                  }`}
                >
                  {busy === child.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : closed && <Check className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTicket(child)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left focus:outline-none"
                >
                  <span className="text-[10px] font-mono text-text-tertiary shrink-0">{formatTicketIdentifier(child, workspace)}</span>
                  <span className={`text-xs truncate ${closed ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>{child.title}</span>
                </button>
                {child.status && (
                  <span className="text-[10px] text-text-tertiary shrink-0 hidden sm:inline">{child.status.name}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={e => { e.preventDefault(); void add(); }} className="flex items-center gap-2 px-2">
        {busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-text-tertiary" /> : <Plus className="w-3.5 h-3.5 text-text-tertiary shrink-0" />}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a sub-task"
          disabled={busy === 'add'}
          className="flex-1 min-w-0 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary py-1 focus:outline-none"
        />
      </form>

      {actionError && <p className="text-[11px] text-status-error px-2">{actionError}</p>}
    </div>
  );
};
