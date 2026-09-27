import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useTicketSearch } from '../../../hooks/useBoardTickets';
import { Ticket } from '../../../types/database';

interface BoardTicketPickerProps {
  onPick: (ticket: Ticket) => void;
  onClose: () => void;
}

/** Search the workspace's tickets and drop one on the board as a live card. */
export const BoardTicketPicker: React.FC<BoardTicketPickerProps> = ({ onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const { results, isLoading, error } = useTicketSearch(debounced);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-3 bg-black/40"
      onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}
    >
      <div className="w-full max-w-md bg-bg-surface border border-border rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-4 h-4 text-text-tertiary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a ticket by title or ID…"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          <button type="button" onClick={onClose} className="p-1 rounded text-text-tertiary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {isLoading && (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-text-tertiary" /></div>
          )}
          {error && (
            <p className="px-3 py-3 text-xs text-status-error">
              {(error as { message?: string }).message || 'Could not search tickets.'}
            </p>
          )}
          {!isLoading && !error && results.length === 0 && (
            <p className="px-3 py-3 text-xs text-text-tertiary">No tickets match.</p>
          )}
          {results.map(ticket => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onPick(ticket)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left hover:bg-bg-surface-hover transition-colors"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: ticket.status?.color || '#868e96' }}
                title={ticket.status?.name}
              />
              <span className="text-[11px] text-text-tertiary shrink-0 tabular-nums">{ticket.identifier}</span>
              <span className="text-xs text-text-primary truncate">{ticket.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
