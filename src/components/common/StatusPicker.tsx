import React, { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export interface StatusOption {
  id: string;
  name: string;
  color?: string | null;
}

interface StatusPickerProps {
  /** Currently selected option id. */
  value?: string | null;
  options: StatusOption[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  size?: 'xs' | 'sm';
  /** Shown in place of the list when `options` is empty. */
  emptyMessage?: string;
  className?: string;
}

/**
 * A `StatusBadge` that opens a popover of statuses when clicked.
 *
 * Deliberately separate from `StatusBadge` rather than an extension of it: the badge
 * renders in ten places that must stay display-only. This knows nothing about workflow
 * states or projects, so the same component serves both.
 *
 * Renders inside clickable rows, so every pointer event is stopped from propagating —
 * clicking the status must not also open the row behind it.
 */
export const StatusPicker: React.FC<StatusPickerProps> = ({
  value,
  options,
  onSelect,
  disabled = false,
  size = 'sm',
  emptyMessage = 'No statuses available.',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.id === value);

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

  if (disabled) {
    // Read-only: render exactly what the rest of the app renders.
    return <StatusBadge name={selected?.name} color={selected?.color} size={size} className={className} />;
  }

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left font-sans ${isOpen ? 'z-40' : 'z-auto'} ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="Change status"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        // No focus ring by request: badges must look identical at rest whether or not one
        // was just clicked. outline-none also suppresses the browser default, so keyboard
        // focus is not indicated here — hover opacity is the only affordance.
        className="cursor-pointer rounded-full focus:outline-none hover:opacity-80 transition-opacity"
      >
        <StatusBadge name={selected?.name} color={selected?.color} size={size} />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-1 min-w-[10rem] max-h-64 overflow-y-auto bg-bg-surface-raised border border-transparent rounded-sm shadow-lg p-1.5 space-y-0.5">
          {options.length === 0 ? (
            <div className="px-2.5 py-1.5 text-xs text-text-tertiary">{emptyMessage}</div>
          ) : (
            options.map(opt => {
              const isSelected = opt.id === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    if (!isSelected) onSelect(opt.id);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-xs rounded-sm flex items-center transition-colors ${
                    isSelected
                      ? 'bg-bg-surface-hover text-text-primary font-medium'
                      : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 mr-2"
                    style={{ backgroundColor: opt.color || '#535353' }}
                  />
                  <span className="truncate">{opt.name}</span>
                  {isSelected && <Check className="w-3 h-3 text-text-primary ml-auto shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
