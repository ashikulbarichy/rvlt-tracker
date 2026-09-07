import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  className = '',
  size = 'xs'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const sizeClasses =
    size === 'xs'
      ? 'px-2 py-0.5 text-[11px]'
      : size === 'sm'
      ? 'px-2.5 py-1 text-xs'
      : 'px-3 py-1.5 text-xs';

  return (
    <div
      className={`relative inline-block text-left font-sans ${isOpen ? 'z-40' : 'z-auto'} ${className}`}
      ref={containerRef}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between space-x-1.5 bg-bg-surface-raised border border-transparent rounded-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses}`}
      >
        <span className="truncate font-medium">{selectedOption?.label}</span>
        <ChevronDown
          className={`w-3 h-3 text-text-tertiary transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-text-primary' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-1 min-w-full bg-bg-surface-raised border border-transparent rounded-sm shadow-lg p-1.5 space-y-0.5">
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-sm flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-bg-surface-hover text-text-primary font-medium'
                    : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <Check className="w-3 h-3 text-text-primary ml-2 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
