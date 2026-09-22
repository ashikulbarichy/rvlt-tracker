import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Loader2, RotateCcw } from 'lucide-react';
import { TicketType } from '../../types/database';

interface ProjectProgressTypePickerProps {
  types: TicketType[];
  /** The project's own override. Empty means it inherits. */
  selectedIds: string[];
  /** The workspace-level countable types, used when `selectedIds` is empty. */
  inheritedIds: string[];
  /** Receives the full desired set. An empty array clears the override. */
  onChange: (typeIds: string[]) => Promise<void>;
  disabled?: boolean;
}

/**
 * Chooses which ticket types count toward a project's progress.
 *
 * Two states, and the difference matters enough to show it: a project either INHERITS
 * the workspace flags (so adding a countable type later reaches it automatically) or
 * OVERRIDES them with its own list. A content-marketing project wants Documentation;
 * a development project wants Feature; the workspace cannot answer both.
 *
 * The last selected type cannot be unchecked. An empty override is stored the same way
 * as no override at all, so "count nothing" and "inherit" would be indistinguishable —
 * clearing is done through the explicit reset instead.
 */
export const ProjectProgressTypePicker: React.FC<ProjectProgressTypePickerProps> = ({
  types,
  selectedIds,
  inheritedIds,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isInheriting = selectedIds.length === 0;
  const effectiveIds = isInheriting ? inheritedIds : selectedIds;
  const effective = types.filter(t => effectiveIds.includes(t.id));

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const commit = async (next: string[]) => {
    setIsSaving(true);
    setError(null);
    try {
      await onChange(next);
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setError(e?.message || 'Could not save which types count.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = (typeId: string) => {
    const on = effectiveIds.includes(typeId);
    // Turning the last one off would store an empty set, which reads as "inherit".
    if (on && effectiveIds.length === 1) return;

    const next = on
      ? effectiveIds.filter(id => id !== typeId)
      : [...effectiveIds, typeId];

    commit(next);
  };

  const label =
    effective.length === 0
      ? 'Nothing'
      : effective.length <= 2
        ? effective.map(t => t.name).join(' + ')
        : `${effective.length} types`;

  return (
    <div ref={containerRef} className="relative inline-block text-left font-sans">
      <button
        type="button"
        disabled={disabled}
        title={disabled ? 'Only admins can change this' : 'Choose which ticket types count toward progress'}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 max-w-[190px] px-2 py-1 rounded-md text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors focus:outline-none disabled:hover:bg-transparent disabled:cursor-default"
      >
        {isSaving
          ? <Loader2 className="w-3 h-3 shrink-0 animate-spin text-text-tertiary" />
          : <span className="text-text-tertiary shrink-0">Counting</span>}
        <span className="font-medium text-text-primary truncate">{label}</span>
        {isInheriting && (
          <span className="shrink-0 text-[9px] uppercase tracking-wider text-text-tertiary">
            default
          </span>
        )}
        {!disabled && <ChevronDown className="w-3 h-3 shrink-0 text-text-tertiary" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-64 bg-bg-surface-raised border border-border rounded-md shadow-lg p-1.5">
          <p className="px-2.5 pt-1.5 pb-2 text-[11px] leading-relaxed text-text-tertiary">
            Progress counts only the ticket types ticked here. Everything else still shows
            in the project, but does not move the bar.
          </p>

          {error && (
            <p className="mx-1 mb-1.5 px-2 py-1.5 text-[11px] text-status-error bg-status-error/10 border border-status-error/30 rounded">
              {error}
            </p>
          )}

          {types.length === 0 ? (
            <div className="px-2.5 py-1.5 text-xs text-text-tertiary">
              This workspace has no ticket types.
            </div>
          ) : (
            <div className="space-y-0.5">
              {types.map(type => {
                const on = effectiveIds.includes(type.id);
                const isLastOn = on && effectiveIds.length === 1;

                return (
                  <button
                    key={type.id}
                    type="button"
                    disabled={isSaving || isLastOn}
                    onClick={() => toggle(type.id)}
                    title={isLastOn ? 'At least one type must count' : undefined}
                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded-sm flex items-center transition-colors disabled:cursor-default ${
                      on
                        ? 'bg-bg-surface-hover text-text-primary font-medium'
                        : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0 mr-2"
                      style={{ backgroundColor: type.color || '#6B7280' }}
                    />
                    <span className="truncate">{type.name}</span>
                    {on && <Check className="w-3 h-3 text-text-primary ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {!isInheriting && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => commit([])}
              className="mt-1.5 w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover transition-colors focus:outline-none disabled:cursor-default"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              Follow the workspace default
            </button>
          )}
        </div>
      )}
    </div>
  );
};
