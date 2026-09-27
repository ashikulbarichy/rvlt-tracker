import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Search, Shapes, X } from 'lucide-react';

import { useApp } from '../../../context/AppContext';
import { useDocs } from '../../../hooks/useDocs';
import { Doc } from '../../../types/database';
import { SidebarToggle } from '../../layout/SidebarToggle';
import { boardThumbnailUrl } from './boardFiles';
import { BOARD_TEMPLATES, BoardTemplateId } from './boardTemplateMeta';

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BoardCard: React.FC<{ board: Doc; onOpen: () => void }> = ({ board, onOpen }) => {
  // The signed URL is issued only to people who can see the board, and is cached for
  // most of its hour in boardThumbnailUrl.
  const { data: thumb } = useQuery({
    queryKey: ['board', board.id, 'thumbnail'],
    queryFn: () => boardThumbnailUrl(board.id),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left rounded-lg border border-border bg-bg-surface hover:border-border-strong hover:bg-bg-surface-raised transition-colors overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
    >
      <div className="aspect-[16/10] bg-white flex items-center justify-center overflow-hidden">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-contain" />
        ) : (
          <span className="text-4xl opacity-80">{board.icon || '🧩'}</span>
        )}
      </div>
      <div className="px-3 py-2.5 border-t border-border">
        <p className="text-xs font-medium text-text-primary truncate">
          {board.icon ? `${board.icon} ` : ''}{board.title || 'Untitled whiteboard'}
        </p>
        <p className="text-[11px] text-text-tertiary mt-0.5">Edited {timeAgo(board.updated_at)}</p>
      </div>
    </button>
  );
};

/**
 * The Whiteboards section: every board the viewer can see, newest first, and the way to
 * start a new one. Boards are documents underneath (same sharing, trash and search) but
 * live here rather than in the docs tree.
 */
export const WhiteboardsView: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { currentWorkspace } = useApp();
  const { docs, isLoading, error, createDoc } = useDocs();

  const [query, setQuery] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [busy, setBusy] = useState<BoardTemplateId | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const boards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs || [])
      .filter(d => d.kind === 'whiteboard')
      .filter(d => !q || (d.title || '').toLowerCase().includes(q))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [docs, query]);

  const open = (id: string) => navigate(`/${workspaceSlug}/whiteboards/${id}`);

  const create = async (templateId: BoardTemplateId) => {
    setBusy(templateId);
    setCreateError(null);
    try {
      const meta = BOARD_TEMPLATES.find(t => t.id === templateId);
      const created = await createDoc({
        kind: 'whiteboard',
        title: templateId === 'blank' ? 'Untitled whiteboard' : meta?.name || 'Whiteboard',
        icon: meta?.icon || '🧩',
      });
      setIsPickerOpen(false);
      // The board seeds itself from the template on first open, once the canvas is up.
      const search = templateId === 'blank' ? '' : `?template=${templateId}`;
      navigate(`/${workspaceSlug}/whiteboards/${created.id}${search}`);
    } catch (err: unknown) {
      setCreateError((err as { message?: string } | null)?.message || 'Could not create the whiteboard.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-3 sm:px-6 pt-2.5 sm:pt-3 pb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <SidebarToggle />
          <h1 className="text-lg font-semibold text-text-primary">Whiteboards</h1>
          <div className="ml-auto flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search whiteboards"
                className="w-full bg-bg-surface border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-strong"
              />
            </div>
            {currentWorkspace && (
              <button
                type="button"
                onClick={() => setIsPickerOpen(true)}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium bg-accent-primary text-white rounded-md px-3 py-1.5 hover:opacity-90 transition-opacity focus:outline-none"
              >
                <Plus className="w-3.5 h-3.5" />
                New whiteboard
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
            {(error as { message?: string }).message || 'Could not load whiteboards.'}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
          </div>
        ) : boards.length === 0 ? (
          <div className="text-center py-20">
            <Shapes className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
            <h2 className="text-sm font-semibold text-text-primary">
              {query ? 'No whiteboards match' : 'No whiteboards yet'}
            </h2>
            {!query && (
              <p className="text-xs text-text-tertiary mt-1 max-w-sm mx-auto">
                Moodboards, brainstorms, retros and flows. Everyone you share a board with can
                work on it with you, live.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {boards.map(board => (
              <BoardCard key={board.id} board={board} onOpen={() => open(board.id)} />
            ))}
          </div>
        )}
      </div>

      {isPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-[10vh] px-3 bg-black/50"
          onMouseDown={e => { if (e.target === e.currentTarget) setIsPickerOpen(false); }}
        >
          <div className="w-full max-w-2xl bg-bg-surface border border-border rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">New whiteboard</h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">Start blank or from a template.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {createError && (
              <div className="mx-5 mt-3 text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
                {createError}
              </div>
            )}
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BOARD_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => create(t.id)}
                  className="text-left px-3 py-3 rounded-md border border-border hover:bg-bg-surface-hover transition-colors focus:outline-none disabled:opacity-60"
                >
                  <span className="flex items-center gap-2">
                    {busy === t.id
                      ? <Loader2 className="w-4 h-4 animate-spin text-text-tertiary shrink-0" />
                      : <span className="text-base leading-none shrink-0">{t.icon}</span>}
                    <span className="text-xs font-medium text-text-primary truncate">{t.name}</span>
                  </span>
                  <span className="block text-[11px] text-text-tertiary mt-1 line-clamp-2">{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
