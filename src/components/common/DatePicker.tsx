import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DatePickerProps {
  value: string; // YYYY-MM-DD or ''
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const toDateString = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const formatDisplay = (value: string) => {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
};

/** Themed date picker matching the app's design system. */
export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pick a date',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const today = new Date();
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [viewYear, setViewYear] = useState((selected || today).getFullYear());
  const [viewMonth, setViewMonth] = useState((selected || today).getMonth());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const openPicker = () => {
    const base = selected || today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setIsOpen(!isOpen);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isToday = (d: number) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  const isSelected = (d: number) =>
    !!selected &&
    d === selected.getDate() &&
    viewMonth === selected.getMonth() &&
    viewYear === selected.getFullYear();

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={openPicker}
        className="w-full flex items-center justify-between space-x-2 text-xs bg-bg-surface-raised hover:bg-bg-surface-hover border border-transparent rounded-sm px-2.5 h-[30px] text-left transition-colors focus:outline-none focus:border-text-secondary"
      >
        <span className={`flex items-center space-x-2 min-w-0 ${value ? 'text-text-primary' : 'text-text-tertiary'}`}>
          <Calendar className="w-3.5 h-3.5 shrink-0 text-text-secondary" />
          <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
        </span>
        {value && (
          <span
            role="button"
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setIsOpen(false);
            }}
            className="p-0.5 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover shrink-0"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-60 bg-bg-surface-raised rounded-md shadow-lg p-3 select-none">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="w-6 h-6 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-semibold text-text-primary">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="w-6 h-6 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="h-6 flex items-center justify-center text-[10px] font-medium text-text-tertiary">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((d, i) =>
              d === null ? (
                <div key={`empty-${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    onChange(toDateString(viewYear, viewMonth, d));
                    setIsOpen(false);
                  }}
                  className={`w-7 h-7 mx-auto flex items-center justify-center rounded-full text-[11px] transition-colors ${
                    isSelected(d)
                      ? 'bg-accent-primary text-button-text font-semibold'
                      : isToday(d)
                        ? 'text-accent-primary font-semibold hover:bg-bg-surface-hover'
                        : 'text-text-primary hover:bg-bg-surface-hover'
                  }`}
                >
                  {d}
                </button>
              )
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-2 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(toDateString(today.getFullYear(), today.getMonth(), today.getDate()));
                setIsOpen(false);
              }}
              className="text-[11px] font-medium text-accent-primary hover:text-accent-primary-hover transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
