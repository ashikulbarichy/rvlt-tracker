import React, { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Sprint, Ticket } from '../../types/database';
import { CustomSelect } from '../common/CustomSelect';
import { sprintLabel } from '../../hooks/useSprints';

interface CompleteSprintModalProps {
  sprint: Sprint;
  tickets: Ticket[];
  /** The same team's sprints; planned ones are the carry-over targets. */
  teamSprints: Sprint[];
  onClose: () => void;
  onComplete: (carryTo: string | null) => Promise<void>;
}

const BACKLOG = '__backlog__';

/**
 * Completing a sprint: decide where unfinished work goes.
 *
 * Finished and canceled tickets stay on the sprint — that is its record. Everything else
 * moves to one planned sprint of the same team, or back to the backlog. complete_sprint()
 * snapshots every outcome before anything moves, so the sprint keeps an honest account of
 * what it was committed to even after its unfinished tickets have gone.
 */
export const CompleteSprintModal: React.FC<CompleteSprintModalProps> = ({
  sprint,
  tickets,
  teamSprints,
  onClose,
  onComplete,
}) => {
  const planned = useMemo(
    () =>
      teamSprints
        .filter(s => s.status === 'planned' && s.id !== sprint.id)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [teamSprints, sprint.id]
  );

  // Default to the next planned sprint: carrying work forward is the common case.
  const [target, setTarget] = useState<string>(planned[0]?.id || BACKLOG);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = tickets.filter(t => t.status?.category === 'completed').length;
  const canceled = tickets.filter(t => t.status?.category === 'canceled').length;
  const unfinished = tickets.length - done - canceled;

  const submit = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onComplete(target === BACKLOG ? null : target);
      onClose();
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setError(e?.message || 'The sprint could not be completed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-[12vh] px-3 sm:px-4 bg-black/50">
      <div className="w-full max-w-md bg-bg-surface border border-border rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Complete {sprintLabel(sprint)}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <p className="text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-bg-surface-raised py-2.5">
              <p className="text-lg font-semibold text-text-primary">{done}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Done</p>
            </div>
            <div className="rounded-md bg-bg-surface-raised py-2.5">
              <p className="text-lg font-semibold text-text-primary">{unfinished}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Unfinished</p>
            </div>
            <div className="rounded-md bg-bg-surface-raised py-2.5">
              <p className="text-lg font-semibold text-text-primary">{canceled}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Canceled</p>
            </div>
          </div>

          {unfinished > 0 ? (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-text-secondary">
                Move the {unfinished} unfinished ticket{unfinished === 1 ? '' : 's'} to
              </label>
              <CustomSelect
                value={target}
                onChange={setTarget}
                options={[
                  ...planned.map(s => ({ value: s.id, label: sprintLabel(s) })),
                  { value: BACKLOG, label: 'The backlog' },
                ]}
                size="sm"
                className="w-full"
              />
              {planned.length === 0 && (
                <p className="text-[11px] text-text-tertiary">
                  This team has no planned sprint to carry them into, so they go back to the
                  backlog. Create the next sprint first if you want them carried over.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-secondary">
              Everything in this sprint is closed. Nothing needs to move.
            </p>
          )}

          <p className="text-[11px] text-text-tertiary">
            Done and canceled tickets stay on this sprint as its record. This cannot be undone.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors focus:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors focus:outline-none disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
            Complete sprint
          </button>
        </div>
      </div>
    </div>
  );
};
