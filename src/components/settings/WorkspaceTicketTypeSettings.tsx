import React from 'react';
import { Loader2, Plus, Trash2, Star } from 'lucide-react';
import { useTicketTypes } from '../../hooks/useTicketTypes';
import { TicketType } from '../../types/database';

interface WorkspaceTicketTypeSettingsProps {
  /** Non-admins see the list read-only; RLS enforces this independently. */
  canEdit?: boolean;
}

const PRESET_COLORS = [
  '#B55151', // Red — Bug
  '#1ED760', // Green — Feature
  '#4A7BB5', // Blue — Improvement
  '#FFA42B', // Orange
  '#F5C842', // Yellow
  '#B37FEB', // Purple
  '#509BF5', // Sky
  '#6B7280', // Neutral
];

/**
 * Ticket types for the workspace.
 *
 * Workspace-level like statuses, and in workspace settings for the same reason: one set
 * shared by every team, so there is nothing per-team to configure.
 *
 * The `counts_toward_progress` toggle is the important control here — it is what makes a
 * project's progress bar track new work rather than raw ticket volume.
 */
export const WorkspaceTicketTypeSettings: React.FC<WorkspaceTicketTypeSettingsProps> = ({
  canEdit = false,
}) => {
  const {
    ticketTypes,
    isLoading,
    createTicketType,
    updateTicketType,
    setDefaultTicketType,
    deleteTicketType,
  } = useTicketTypes();

  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState(PRESET_COLORS[7]);
  const [isCreating, setIsCreating] = React.useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  /** Every write goes through here so one failure path surfaces one message. */
  const run = async (id: string | null, fn: () => Promise<void>) => {
    if (!canEdit) return;
    setError(null);
    setBusyId(id);
    try {
      await fn();
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setError(e?.message || 'That change could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsCreating(true);
    await run(null, async () => {
      await createTicketType({ name, color: newColor });
      setNewName('');
    });
    setIsCreating(false);
  };

  return (
    <div className="space-y-4 pt-8 border-t border-border">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Ticket types</h3>
        <p className="text-xs text-text-tertiary mt-1">
          {canEdit
            ? 'Shared across the whole workspace. Only types marked “counts toward progress” move a project’s progress bar.'
            : 'Ticket types are shared across the workspace. Only admins can change them.'}
        </p>
      </div>

      {error && (
        <div className="text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {(ticketTypes || []).map((type: TicketType) => {
          const isBusy = busyId === type.id;
          return (
            <div
              key={type.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-bg-surface-raised border border-transparent rounded-lg"
            >
              {/* Identity: colour dot, name, and the one long-labelled control, which
                  lives on the secondary line where the workflow rows put the category.
                  Keeping it out of the control cluster is what stops rows wrapping to
                  different heights depending on how long the type name is. */}
              <div className="flex items-center space-x-3 min-w-0">
                <div
                  className="w-3 h-3 rounded-full border border-transparent shrink-0"
                  style={{ backgroundColor: type.color }}
                />
                <div className="min-w-0">
                  {canEdit ? (
                    <input
                      type="text"
                      defaultValue={type.name}
                      disabled={isBusy}
                      onBlur={e => {
                        const name = e.target.value.trim();
                        if (!name || name === type.name) {
                          e.target.value = type.name;
                          return;
                        }
                        run(type.id, () => updateTicketType(type.id, { name }));
                      }}
                      className="w-full text-sm font-medium text-text-primary bg-transparent border border-transparent rounded px-1 -ml-1 hover:border-border focus:outline-none focus:border-text-secondary"
                    />
                  ) : (
                    <div className="text-sm font-medium text-text-primary">{type.name}</div>
                  )}

                  <label
                    className={`flex items-center gap-1.5 mt-0.5 text-[10px] uppercase tracking-wider text-text-tertiary ${
                      canEdit ? 'cursor-pointer hover:text-text-secondary' : ''
                    }`}
                    title="Tickets of this type move the project progress bar."
                  >
                    <input
                      type="checkbox"
                      checked={type.counts_toward_progress}
                      disabled={!canEdit || isBusy}
                      onChange={e =>
                        run(type.id, () =>
                          updateTicketType(type.id, { counts_toward_progress: e.target.checked })
                        )
                      }
                      className="accent-accent-primary w-3 h-3"
                    />
                    Counts toward progress
                  </label>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    disabled={!canEdit || isBusy}
                    onClick={() => run(type.id, () => updateTicketType(type.id, { color }))}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      canEdit ? 'hover:scale-110' : 'cursor-default opacity-70'
                    } ${
                      type.color === color
                        ? 'border-text-primary ring-1 ring-text-primary/50'
                        : 'border-border/60 hover:border-text-secondary'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}

                <span className="w-px h-5 bg-border" aria-hidden="true" />

                <button
                  type="button"
                  title={type.is_default ? 'Default type for new tickets' : 'Make default for new tickets'}
                  disabled={!canEdit || isBusy || type.is_default}
                  onClick={() => run(type.id, () => setDefaultTicketType(type.id))}
                  className={`p-1 rounded transition-colors focus:outline-none ${
                    type.is_default
                      ? 'text-status-warning'
                      : canEdit
                        ? 'text-text-tertiary hover:text-text-primary'
                        : 'text-text-tertiary opacity-50'
                  }`}
                >
                  <Star className="w-3.5 h-3.5" fill={type.is_default ? 'currentColor' : 'none'} />
                </button>

                <button
                  type="button"
                  title="Delete this type"
                  disabled={!canEdit || isBusy}
                  onClick={() => run(type.id, () => deleteTicketType(type.id))}
                  className="p-1 rounded text-text-tertiary hover:text-status-error transition-colors focus:outline-none disabled:opacity-50"
                >
                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-bg-surface-raised border border-dashed border-border rounded-lg">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div
              className="w-3 h-3 rounded-full border border-transparent shrink-0"
              style={{ backgroundColor: newColor }}
            />
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="New type name…"
              className="w-full text-sm font-medium text-text-primary bg-transparent border border-transparent rounded px-1 -ml-1 placeholder:font-normal placeholder:text-text-tertiary hover:border-border focus:outline-none focus:border-text-secondary"
            />
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => setNewColor(color)}
                className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                  newColor === color
                    ? 'border-text-primary ring-1 ring-text-primary/50'
                    : 'border-border/60 hover:border-text-secondary'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}

            <span className="w-px h-5 bg-border" aria-hidden="true" />

            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || isCreating}
              className="inline-flex items-center gap-1 text-xs font-medium bg-accent-primary text-white rounded-md px-3 py-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity focus:outline-none"
            >
              {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add type
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-tertiary">
        A type that still has tickets cannot be deleted — reassign them first.
      </p>
    </div>
  );
};
