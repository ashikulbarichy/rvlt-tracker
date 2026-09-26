import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Ticket } from '../../types/database';
import { CustomSelect } from './CustomSelect';
import { sprintLabel, useSprints } from '../../hooks/useSprints';

interface SprintPickerProps {
  /** Only this team's sprints are offered — the database refuses any other. */
  teamId?: string;
  value: string | null;
  /** The ticket's joined sprint, so a completed one still renders its own name. */
  current?: Ticket['sprint'];
  /** May reject; the message is shown under the picker. */
  onChange: (sprintId: string | null) => Promise<void> | void;
  disabled?: boolean;
}

const NONE = '';

/**
 * Chooses a ticket's sprint.
 *
 * Offers the team's active and planned sprints. A completed sprint is never offered as a
 * destination (the tickets_sprint_guard trigger would refuse it), but if the ticket
 * already sits in one it is listed as its current value, otherwise the select would
 * fall back to "No sprint" and misreport it.
 */
export const SprintPicker: React.FC<SprintPickerProps> = ({ teamId, value, current, onChange, disabled = false }) => {
  const { sprints, isLoading, error: loadError } = useSprints(teamId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (sprints || [])
    .filter(s => s.status !== 'completed')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return a.start_date.localeCompare(b.start_date);
    });

  const currentIsListed = !value || open.some(s => s.id === value);
  const currentCompleted = !currentIsListed
    ? (sprints || []).find(s => s.id === value) || (current?.id === value ? current : undefined)
    : undefined;

  const options = [
    { value: NONE, label: 'No sprint' },
    ...open.map(s => ({ value: s.id, label: s.status === 'active' ? `${sprintLabel(s)} (active)` : sprintLabel(s) })),
    ...(currentCompleted ? [{ value: currentCompleted.id, label: `${sprintLabel(currentCompleted)} (completed)` }] : []),
  ];

  const handle = async (next: string) => {
    const nextValue = next === NONE ? null : next;
    if (nextValue === value) return;
    setIsSaving(true);
    setError(null);
    try {
      await onChange(nextValue);
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setError(e?.message || 'The sprint could not be changed.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!teamId) {
    return <p className="text-[11px] text-text-tertiary py-1.5">Pick a team first.</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <CustomSelect
          value={value || NONE}
          onChange={handle}
          options={options}
          disabled={disabled || isSaving || isLoading}
          size="sm"
          className="w-full"
        />
        {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-tertiary shrink-0" />}
      </div>
      {loadError && (
        <p className="text-[11px] text-status-error">{(loadError as Error).message}</p>
      )}
      {error && <p className="text-[11px] text-status-error">{error}</p>}
    </div>
  );
};
