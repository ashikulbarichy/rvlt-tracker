import React, { useState } from 'react';
import { Ban, Loader2, Plus, X } from 'lucide-react';
import type { Ticket, Workspace } from '../../types/database';
import { useApp } from '../../context/AppContext';
import { LinkedTicket, useTicketBlocks, useTicketSearch } from '../../hooks/useTicketBlocks';
import { fetchTicketForPanel } from '../../hooks/useSprints';
import { formatTicketIdentifier } from '../../lib/identifier';

interface TicketBlocksProps {
  ticket: Ticket;
  workspace: Workspace | null;
}

const closed = (t: LinkedTicket) => t.status?.category === 'completed' || t.status?.category === 'canceled';

/** "Blocked by" and "Blocks" for one ticket, with a search to add a blocker. */
export const TicketBlocks: React.FC<TicketBlocksProps> = ({ ticket, workspace }) => {
  const { setSelectedTicket } = useApp();
  const { blockedBy, blocking, isBlocked, isLoading, error, addBlock, removeBlock } = useTicketBlocks(ticket.id);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const { results, isFetching } = useTicketSearch(ticket.workspace_id, adding ? query : '', ticket.id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await work();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : (e as { message?: string })?.message || 'That did not save.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const label = (t: LinkedTicket) => formatTicketIdentifier(t as unknown as Partial<Ticket>, workspace);

  const open = (id: string) => run(async () => setSelectedTicket(await fetchTicketForPanel(id)));

  const row = (t: LinkedTicket, onRemove: () => void) => (
    <li key={t.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-surface-hover/60">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.status?.color || 'var(--color-text-tertiary)' }} />
      <button type="button" onClick={() => open(t.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left focus:outline-none">
        <span className="text-[10px] font-mono text-text-tertiary shrink-0">{label(t)}</span>
        <span className={`text-xs truncate ${closed(t) ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>{t.title}</span>
      </button>
      <button
        type="button"
        title="Remove link"
        disabled={busy}
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-text-tertiary hover:text-status-error transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-primary uppercase tracking-wider">
          <Ban className={`w-3.5 h-3.5 ${isBlocked ? 'text-status-error' : 'text-accent-primary'}`} />
          Dependencies
        </h3>
        {isBlocked && <span className="text-[11px] font-medium text-status-error">Blocked</span>}
      </div>

      {error ? (
        <p className="text-xs text-status-error">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="flex items-center gap-2 text-xs text-text-tertiary"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</p>
      ) : (
        <>
          {blockedBy.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary px-2 mb-0.5">Blocked by</p>
              <ul>{blockedBy.map(t => row(t, () => run(() => removeBlock({ blockerId: t.id, blockedId: ticket.id }))))}</ul>
            </div>
          )}
          {blocking.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary px-2 mb-0.5">Blocks</p>
              <ul>{blocking.map(t => row(t, () => run(() => removeBlock({ blockerId: ticket.id, blockedId: t.id }))))}</ul>
            </div>
          )}
        </>
      )}

      {adding ? (
        <div className="relative px-2">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setQuery(''); } }}
            placeholder="Blocked by… search a title or number"
            className="w-full bg-bg-surface-raised rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          {query.trim() && (
            <ul className="absolute z-20 left-2 right-2 mt-1 bg-bg-surface-raised rounded-md shadow-lg p-1 max-h-56 overflow-y-auto">
              {isFetching && results.length === 0 ? (
                <li className="px-2 py-1.5 text-[11px] text-text-tertiary">Searching…</li>
              ) : results.length === 0 ? (
                <li className="px-2 py-1.5 text-[11px] text-text-tertiary">No tickets match.</li>
              ) : (
                results.map(t => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await run(() => addBlock({ blockerId: t.id, blockedId: ticket.id, workspaceId: ticket.workspace_id }));
                        if (ok) { setAdding(false); setQuery(''); }
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-bg-surface-hover focus:outline-none"
                    >
                      <span className="text-[10px] font-mono text-text-tertiary shrink-0">{label(t)}</span>
                      <span className="text-xs text-text-primary truncate">{t.title}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-2 text-xs text-text-tertiary hover:text-text-primary focus:outline-none"
        >
          <Plus className="w-3.5 h-3.5" /> Add a blocker
        </button>
      )}

      {actionError && <p className="text-[11px] text-status-error px-2">{actionError}</p>}
    </div>
  );
};
