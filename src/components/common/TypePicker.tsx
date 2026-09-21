import React, { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import { TypeBadge } from './TypeBadge';

export interface TypeOption {
  id: string;
  name: string;
  color?: string | null;
}

interface TypePickerProps {
  value?: string | null;
  options: TypeOption[];
  /**
   * The row's own joined type, used when `value` is not in `options` — e.g. while the
   * type list is still loading. Without it the badge falls through to "No type" and
   * misreports a ticket that does have one.
   */
  current?: TypeOption | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  size?: 'xs' | 'sm';
  emptyMessage?: string;
  className?: string;
}

/**
 * A `TypeBadge` that opens a popover of ticket types when clicked.
 *
 * Mirrors `StatusPicker`, including the no-focus-ring decision and stopping every
 * pointer event: these render inside clickable ticket rows, and clicking the type must
 * not also open the ticket behind it.
 */
export const TypePicker: React.FC<TypePickerProps> = ({
  value,
  options,
  current,
  onSelect,
  disabled = false,
  size = 'sm',
  emptyMessage = 'No ticket types available.',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected =
    options.find(o => o.id === value) || (current && current.id === value ? current : undefined);

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
    return <TypeBadge name={selected?.name} color={selected?.color} size={size} className={className} />;
  }

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left font-sans ${isOpen ? 'z-40' : 'z-auto'} ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="Change type"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="cursor-pointer rounded-full focus:outline-none hover:opacity-80 transition-opacity"
      >
        <TypeBadge name={selected?.name} color={selected?.color} size={size} />
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
                    style={{ backgroundColor: opt.color || '#6B7280' }}
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
