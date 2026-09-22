import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { useApp } from '../../context/AppContext';
import { useTeams } from '../../hooks/useTeams';
import { useDoc, useDocs } from '../../hooks/useDocs';
import { useDocShares } from '../../hooks/useDocShares';
import { useShareableTeams } from '../../hooks/useShareableTeams';
import { useWorkspaceMembers } from '../../hooks/useWorkspaceMembers';
import { Doc, DocVisibility } from '../../types/database';
import { DocEditor, DocHeading } from './DocEditor';
import { DocHeader, SaveState } from './DocHeader';
import { DocSharePanel } from './DocSharePanel';
import { DocTableOfContents } from './DocTableOfContents';

const AUTOSAVE_MS = 800;

/** Root-first ancestors of `doc`, resolved from the flat list. */
function ancestorsOf(doc: Doc | null, all: Doc[]): Doc[] {
  if (!doc) return [];
  const byId = new Map(all.map(d => [d.id, d]));
  const out: Doc[] = [];
  let cursor = doc.parent_id ? byId.get(doc.parent_id) : undefined;
  // The database forbids cycles, but a corrupt tree must not hang the UI.
  let guard = 0;
  while (cursor && guard < 100) {
    out.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    guard += 1;
  }
  return out;
}

export const DocPane: React.FC = () => {
  const { docId, workspaceSlug } = useParams<{ docId: string; workspaceSlug: string }>();
  const navigate = useNavigate();
  const { currentUser, userRole, currentWorkspace } = useApp();
  // Two team lists, and they must not be confused. `teams` is RLS-filtered to the ones
  // this person belongs to and is what canEdit below reads; `shareableTeams` is every
  // team in the workspace and is only ever offered as a sharing target.
  //
  // useTeams returns [] without a workspace id, so the bare call this used to make left
  // the team list permanently empty -- sharing by team had nothing to offer.
  const { teams } = useTeams(currentWorkspace?.id);
  const { shareableTeams } = useShareableTeams(currentWorkspace?.id);
  const queryClient = useQueryClient();

  const { doc, isLoading, error: loadError } = useDoc(docId);
  const { docs, saveDoc, trashDoc } = useDocs();
  const { members } = useWorkspaceMembers(currentWorkspace?.id);
  const {
    shares, isLoading: sharesLoading, error: sharesError, grantShare, revokeShare,
  } = useDocShares(docId);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [headings, setHeadings] = useState<DocHeading[]>([]);
  const [counts, setCounts] = useState({ words: 0, characters: 0 });

  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Partial<Doc>>({});

  const ancestors = useMemo(() => ancestorsOf(doc ?? null, docs || []), [doc, docs]);

  const isAuthor = !!doc && doc.created_by === currentUser?.id;
  const isAdmin = userRole === 'admin';

  /**
   * Who may decide what the document is and who else gets in. Mirrors the
   * docs_guard_visibility trigger and the doc_shares write policy: editing a document
   * is not a right to change who can see it.
   */
  const canManageAccess = isAuthor || isAdmin;

  /**
   * Client-side mirror of the RLS UPDATE predicate, for UX only — the policy is the
   * real boundary. If this is ever too permissive the save fails and the error surfaces
   * in the header rather than being swallowed.
   */
  const canEdit = useMemo(() => {
    if (!doc) return false;
    if (doc.visibility === 'workspace') return true;
    if (isAuthor || isAdmin) return true;
    // 'restricted': an edit-level share, granted to me or to a team I am in. `teams`,
    // never shareableTeams -- the latter lists teams I am NOT on, and reading it here
    // would grant edit rights on every team-shared document in the workspace. Viewer
    // shares deliberately fall through to false.
    return (shares || []).some(
      s =>
        s.can_edit &&
        (s.user_id === currentUser?.id ||
          (!!s.team_id && (teams || []).some(t => t.id === s.team_id)))
    );
  }, [doc, isAuthor, isAdmin, shares, currentUser, teams]);

  const flush = useCallback(async () => {
    if (!docId) return;
    const payload = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(payload).length === 0) return;

    setSaveState('saving');
    setSaveError(null);
    try {
      await saveDoc({ id: docId, ...payload });
      setSaveState('saved');
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setSaveState('error');
      setSaveError(e?.message || 'Your last change was not saved.');
    }
  }, [docId, saveDoc]);

  const queue = useCallback((patch: Partial<Doc>) => {
    pendingRef.current = { ...pendingRef.current, ...patch };
    setSaveState('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, AUTOSAVE_MS);
  }, [flush]);

  // Flush on unmount and on doc change, so navigating away mid-debounce does not
  // discard the last keystrokes.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void flush();
    };
  }, [flush]);

  // Ctrl/Cmd+S saves immediately rather than letting the browser open a save dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (timerRef.current) clearTimeout(timerRef.current);
        void flush();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flush]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-status-error font-medium">This document could not be loaded.</p>
          <p className="text-xs text-text-tertiary mt-1 max-w-sm">
            {(loadError as { message?: string }).message}
          </p>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-text-primary font-medium">This document is not available.</p>
          <p className="text-xs text-text-tertiary mt-1 max-w-sm">
            It may have been moved to the trash, or its visibility may not include you.
          </p>
        </div>
      </div>
    );
  }

  const handleTrash = async () => {
    await trashDoc({ id: doc.id });
    navigate(`/${workspaceSlug}/docs`);
  };

  /**
   * Visibility saves immediately rather than through the autosave debounce.
   *
   * It is a deliberate, one-click decision about who can see the document, and the
   * write is the one most likely to be rejected by RLS — waiting seconds to find out
   * reads as the setting silently not sticking.
   */
  const handleVisibility = async (visibility: DocVisibility) => {
    queue({ visibility });
    if (timerRef.current) clearTimeout(timerRef.current);
    await flush();

    // Re-read rather than trust the optimistic patch. An UPDATE that RLS refuses on its
    // USING clause changes no rows and raises NO error, so a rejected change would
    // otherwise be reported as saved and displayed as applied. This is the one setting
    // where showing a value the database did not store is not acceptable.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['doc', docId] }),
      queryClient.invalidateQueries({ queryKey: ['docs'] }),
    ]);
  };

  return (
    <div className="flex-1 flex min-w-0">
      <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 sm:px-10 py-8">
          <DocHeader
            doc={doc}
            ancestors={ancestors}
            canEdit={canEdit}
            isAuthor={isAuthor}
            canManageAccess={canManageAccess}
            saveState={saveState}
            saveError={saveError}
            onTitleChange={title => queue({ title })}
            onIconChange={icon => queue({ icon })}
            onVisibilityChange={handleVisibility}
            sharePanel={
              canManageAccess ? (
                <DocSharePanel
                  shares={shares || []}
                  isLoading={sharesLoading}
                  loadError={sharesError ? (sharesError as Error).message : null}
                  members={members || []}
                  teams={shareableTeams || []}
                  authorId={doc.created_by}
                  onGrant={(principal, canEditShare) =>
                    grantShare({ docId: doc.id, ...principal, canEdit: canEditShare })
                  }
                  onRevoke={shareId => revokeShare(shareId)}
                />
              ) : (
                <p className="text-[11px] text-text-tertiary">
                  Shared with specific people and teams.
                </p>
              )
            }
            onTrash={handleTrash}
            onBreadcrumbClick={id => navigate(`/${workspaceSlug}/docs/${id}`)}
          />

          <div className="mt-6">
            {/* Keyed on the document: DocEditor takes `content` as an initial value, so
                switching documents must give it a fresh instance. */}
            <DocEditor
              key={doc.id}
              content={doc.content}
              editable={canEdit}
              onChange={(html, text) => queue({ content: html, content_text: text })}
              onHeadingsChange={setHeadings}
              onCharacterCount={setCounts}
            />
          </div>

          <div className="mt-10 pt-4 border-t border-border flex items-center justify-between text-[11px] text-text-tertiary">
            <span>{counts.words} words · {counts.characters} characters</span>
            {!canEdit && <span>Read-only</span>}
            {userRole === 'admin' && doc.status === 'draft' && canEdit && (
              <button
                type="button"
                onClick={() => queue({ status: 'published' })}
                className="text-accent-primary hover:underline focus:outline-none"
              >
                Mark as published
              </button>
            )}
          </div>
        </div>
      </div>

      <DocTableOfContents headings={headings} scrollRef={scrollRef} />
    </div>
  );
};
