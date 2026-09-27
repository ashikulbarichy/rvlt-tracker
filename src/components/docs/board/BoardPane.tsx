import React, { Suspense, lazy, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Doc, Ticket } from '../../../types/database';
import type { MentionablePerson } from '../extensions/mentionItems';
import { isBoardTemplateId } from './boardTemplateMeta';

// Excalidraw is 1–2 MB. It loads when a whiteboard is opened and never for pages.
const BoardCanvas = lazy(() => import('./BoardCanvas'));

interface BoardPaneProps {
  doc: Doc;
  canEdit: boolean;
  people: MentionablePerson[];
  onSearchText: (text: string) => void;
}

/** The canvas area of a whiteboard document; the header is DocHeader in compact mode. */
export const BoardPane: React.FC<BoardPaneProps> = ({ doc, canEdit, people, onSearchText }) => {
  const { currentUser, setSelectedTicket } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const templateParam = searchParams.get('template');
  const templateId = isBoardTemplateId(templateParam) ? templateParam : null;

  // The template seeds an empty board once; drop it from the URL so a reload or a shared
  // link does not offer to seed again.
  const consumeTemplate = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('template');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  if (!currentUser) return null;

  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
        </div>
      }
    >
      <BoardCanvas
        key={doc.id}
        doc={doc}
        canEdit={canEdit}
        me={{
          id: currentUser.id,
          name: currentUser.full_name || currentUser.email || 'Someone',
          avatarUrl: currentUser.avatar_url || null,
        }}
        people={people}
        templateId={templateId}
        onTemplateConsumed={consumeTemplate}
        onSearchText={onSearchText}
        onOpenTicket={(ticket: Ticket) => setSelectedTicket(ticket)}
      />
    </Suspense>
  );
};
