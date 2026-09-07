import React from 'react';

interface StatusBadgeProps {
  name?: string | null;
  color?: string | null;
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * The one true status badge: solid pill in the workflow state's color with
 * white text. Use this everywhere a status is shown so badges look identical
 * across the app.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  name,
  color,
  size = 'sm',
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium text-white whitespace-nowrap ${
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${className}`}
      style={{ backgroundColor: color || '#535353' }}
    >
      {name || 'Todo'}
    </span>
  );
};
