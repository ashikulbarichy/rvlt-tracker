import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Columns3, Loader2, MessagesSquare, RefreshCcw } from 'lucide-react';
import type { Sprint } from '../../types/database';
import { useDocs } from '../../hooks/useDocs';
import { sprintLabel, useSprints } from '../../hooks/useSprints';

const pill =
  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors focus:outline-none disabled:opacity-50';

/** Board, standup and retro for a running or finished sprint. */
export const SprintCeremonies: React.FC<{ sprint: Sprint; onError: (message: string) => void }> = ({ sprint, onError }) => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const navigate = useNavigate();
  const { createDoc } = useDocs();
  const { updateSprint } = useSprints();
  const [creating, setCreating] = useState(false);

  if (sprint.status === 'planned') return null;

  const openRetro = async () => {
    if (sprint.retro_doc_id) {
      navigate(`/${workspaceSlug}/whiteboards/${sprint.retro_doc_id}`);
      return;
    }
    setCreating(true);
    try {
      const doc = await createDoc({ kind: 'whiteboard', title: `${sprintLabel(sprint)} retro`, icon: '🔁' });
      await updateSprint({ id: sprint.id, retro_doc_id: doc.id });
      // The board seeds itself from the template on first open.
      navigate(`/${workspaceSlug}/whiteboards/${doc.id}?template=retro`);
    } catch (e) {
      onError((e as { message?: string } | null)?.message || 'Could not start the retro.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button type="button" className={pill} onClick={() => navigate(`/${workspaceSlug}/sprints/${sprint.id}/board`)}>
        <Columns3 className="w-3.5 h-3.5" /> Board
      </button>
      {sprint.status === 'active' && (
        <button type="button" className={pill} onClick={() => navigate(`/${workspaceSlug}/sprints/${sprint.id}/standup`)}>
          <MessagesSquare className="w-3.5 h-3.5" /> Standup
        </button>
      )}
      <button type="button" className={pill} disabled={creating} onClick={openRetro}>
        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
        {sprint.retro_doc_id ? 'Retro' : 'Start retro'}
      </button>
    </>
  );
};
