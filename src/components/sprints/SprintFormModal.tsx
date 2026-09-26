import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Sprint } from '../../types/database';
import { DatePicker } from '../common/DatePicker';
import { DEFAULT_SPRINT_DAYS, defaultSprintDates, sprintLabel } from '../../hooks/useSprints';

interface SprintFormModalProps {
  /** The team the sprint belongs to. Fixed: a sprint cannot move team. */
  teamName: string;
  /** The team's existing sprints, for the default dates. */
  teamSprints: Sprint[];
  /** Present when editing. */
  sprint?: Sprint;
  onClose: () => void;
  onSubmit: (values: { name: string; goal: string; start_date: string; end_date: string }) => Promise<void>;
}

/**
 * Create or edit a sprint.
 *
 * The number is not editable and not shown as a field — the database assigns it. Dates
 * default to the day after the team's last sprint, two weeks long; overlap is refused by
 * the database, and its message ("These dates overlap Sprint 3") is shown as-is because
 * it names the conflict better than the client could.
 */
export const SprintFormModal: React.FC<SprintFormModalProps> = ({
  teamName,
  teamSprints,
  sprint,
  onClose,
  onSubmit,
}) => {
  const defaults = sprint
    ? { start: sprint.start_date, end: sprint.end_date }
    : defaultSprintDates(teamSprints);

  const [name, setName] = useState(sprint?.name || '');
  const [goal, setGoal] = useState(sprint?.goal || '');
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCompleted = sprint?.status === 'completed';
  const datesInvalid = !startDate || !endDate || endDate < startDate;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (datesInvalid) {
      setError('The end date must be on or after the start date.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({ name, goal, start_date: startDate, end_date: endDate });
      onClose();
    } catch (err: unknown) {
      const e2 = err as { message?: string } | null;
      setError(e2?.message || 'The sprint could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-[12vh] px-3 sm:px-4 bg-black/50">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-bg-surface border border-border rounded-lg shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary truncate">
              {sprint ? `Edit ${sprintLabel(sprint)}` : 'New sprint'}
            </h2>
            <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{teamName}</p>
          </div>
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

          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">
              Name <span className="text-text-tertiary font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={sprint ? `Sprint ${sprint.number}` : 'Numbered automatically'}
              className="w-full px-3 py-2 text-xs bg-bg-surface-raised border border-transparent rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Goal</label>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              rows={3}
              placeholder="What does this sprint have to achieve?"
              className="w-full px-3 py-2 text-xs bg-bg-surface-raised border border-transparent rounded-md text-text-primary placeholder:text-text-tertiary resize-y focus:outline-none focus:border-text-secondary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1">Start</label>
              {isCompleted ? (
                <p className="text-xs text-text-tertiary py-2">{startDate}</p>
              ) : (
                <DatePicker value={startDate} onChange={setStartDate} placeholder="Start date" />
              )}
            </div>
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1">End</label>
              {isCompleted ? (
                <p className="text-xs text-text-tertiary py-2">{endDate}</p>
              ) : (
                <DatePicker value={endDate} onChange={setEndDate} placeholder="End date" />
              )}
            </div>
          </div>

          {!sprint && (
            <p className="text-[11px] text-text-tertiary">
              Starts the day after this team's last sprint and runs {DEFAULT_SPRINT_DAYS} days
              by default.
            </p>
          )}
          {isCompleted && (
            <p className="text-[11px] text-text-tertiary">A completed sprint's dates are fixed.</p>
          )}
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
            type="submit"
            disabled={isSaving || datesInvalid}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors focus:outline-none disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
            {sprint ? 'Save' : 'Create sprint'}
          </button>
        </div>
      </form>
    </div>
  );
};
