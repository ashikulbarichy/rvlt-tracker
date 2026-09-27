import React, { useState } from 'react';
import type { StoryPoints } from '../../types/database';
import { STORY_POINT_SCALE } from '../../lib/storyPoints';

interface StoryPointPickerProps {
  value: number | null;
  /** False for types that are not estimated (Bug). */
  takesPoints: boolean;
  typeName?: string;
  /** Overrides the "not estimated" note, e.g. for a sub-task. */
  note?: string;
  /** Only workspace admins estimate; everyone else sees the value. */
  canEdit: boolean;
  onChange: (points: StoryPoints | null) => Promise<void>;
}

export const StoryPointPicker: React.FC<StoryPointPickerProps> = ({ value, takesPoints, typeName, note, canEdit, onChange }) => {
  const [saving, setSaving] = useState<number | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (next: StoryPoints | null) => {
    if (next === value) return;
    setSaving(next ?? 'clear');
    setError(null);
    try {
      await onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the estimate.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-secondary">Story points</label>
        {takesPoints && canEdit && value != null && (
          <button
            type="button"
            onClick={() => choose(null)}
            disabled={saving !== null}
            className="text-[10px] text-text-tertiary hover:text-status-error transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {!takesPoints ? (
        <div className="text-xs text-text-tertiary">
          {note ?? (typeName ? `${typeName} tickets aren't estimated.` : 'This type isn’t estimated.')}
        </div>
      ) : canEdit ? (
        <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label="Story points">
          {STORY_POINT_SCALE.map(points => {
            const selected = value === points;
            return (
              <button
                key={points}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={saving !== null}
                onClick={() => choose(points)}
                className={`h-7 rounded-sm text-xs font-medium tabular-nums transition-colors disabled:opacity-60 ${
                  selected
                    ? 'bg-accent-primary text-button-text'
                    : 'bg-bg-surface-raised text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                }`}
              >
                {saving === points ? '…' : points}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-text-primary">
          {value != null ? `${value} point${value === 1 ? '' : 's'}` : <span className="text-text-tertiary">Not estimated</span>}
          <span className="block text-[10px] text-text-tertiary mt-0.5">Only admins can estimate.</span>
        </div>
      )}

      {error && <div className="text-[11px] text-status-error">{error}</div>}
    </div>
  );
};
