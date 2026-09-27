import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import type { BoardThread } from '../../../hooks/useBoardComments';
import type { MentionablePerson } from '../extensions/mentionItems';

interface BoardCommentPopoverProps {
  theme: 'light' | 'dark';
  /** Container-relative position of the pin. */
  left: number;
  top: number;
  containerWidth: number;
  /** An existing thread, or null for a new comment at the pin. */
  thread: BoardThread | null;
  people: MentionablePerson[];
  meId: string | undefined;
  canEdit: boolean;
  onSubmit: (body: string) => Promise<void>;
  onResolve: (resolved: boolean) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onClose: () => void;
}

const WIDTH = 300;

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** A comment thread pinned to the canvas: read, reply, resolve. */
export const BoardCommentPopover: React.FC<BoardCommentPopoverProps> = ({
  theme, left, top, containerWidth, thread, people, meId, canEdit,
  onSubmit, onResolve, onDelete, onClose,
}) => {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [thread?.root.id]);

  const dark = theme === 'dark';
  const person = (id: string) => people.find(p => p.id === id);
  const all = thread ? [thread.root, ...thread.replies] : [];
  const resolved = !!thread?.root.resolved_at;
  const canResolve = !!thread && (thread.root.author_id === meId || canEdit);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setError((err as { message?: string } | null)?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const text = body.trim();
    if (!text || busy) return;
    void run(async () => {
      await onSubmit(text);
      setBody('');
    });
  };

  const x = Math.max(8, Math.min(left + 18, containerWidth - WIDTH - 8));

  return (
    <div
      className={`absolute z-20 rounded-xl border shadow-2xl pointer-events-auto ${
        dark ? 'bg-[#232329] border-[#3a3a40] text-gray-100' : 'bg-white border-gray-200 text-gray-800'
      }`}
      style={{ left: x, top: Math.max(8, top - 12), width: WIDTH }}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => {
        // Keep Excalidraw's shortcuts out of the comment box.
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className={`flex items-center justify-between px-3 py-2 border-b ${dark ? 'border-white/10' : 'border-gray-100'}`}>
        <span className="text-xs font-semibold">{thread ? (resolved ? 'Resolved thread' : 'Comment') : 'New comment'}</span>
        <div className="flex items-center gap-0.5">
          {canResolve && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => onResolve(!resolved))}
              title={resolved ? 'Reopen' : 'Resolve'}
              className={`p-1 rounded ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            >
              {resolved ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            </button>
          )}
          <button type="button" onClick={onClose} title="Close"
            className={`p-1 rounded ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {all.length > 0 && (
        <div className="max-h-64 overflow-y-auto px-3 py-2 space-y-3">
          {all.map(c => {
            const author = person(c.author_id);
            return (
              <div key={c.id} className="group">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <img
                    src={author?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(author?.name || '?')}&background=282828&color=FFFFFF&rounded=true`}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover"
                  />
                  <span className="font-medium">{author?.name || 'Former member'}</span>
                  <span className="opacity-60">{timeAgo(c.created_at)}</span>
                  {c.author_id === meId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => onDelete(c.id))}
                      title={c.parent_id ? 'Delete reply' : 'Delete thread'}
                      className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className={`px-3 py-2 ${all.length > 0 ? `border-t ${dark ? 'border-white/10' : 'border-gray-100'}` : ''}`}>
        <textarea
          ref={inputRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={thread ? 'Reply…' : 'Add a comment…'}
          className={`w-full resize-none rounded-md border px-2 py-1.5 text-xs focus:outline-none ${
            dark ? 'bg-black/20 border-white/10 placeholder:text-gray-500' : 'bg-gray-50 border-gray-200 placeholder:text-gray-400'
          }`}
        />
        {error && <p className="mt-1 text-[11px] text-[#e03131]">{error}</p>}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] opacity-50">Enter to send · Shift+Enter for a new line</span>
          <button
            type="button"
            disabled={busy || !body.trim()}
            onClick={submit}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-[#4C8DFF] text-white disabled:opacity-40"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            {thread ? 'Reply' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
};
