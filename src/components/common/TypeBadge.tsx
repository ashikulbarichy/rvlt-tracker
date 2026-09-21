import React from 'react';

interface TypeBadgeProps {
  name?: string | null;
  color?: string | null;
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * The one true ticket type badge.
 *
 * Outlined and tinted rather than solid, deliberately: a type badge sits next to a
 * StatusBadge on the same row, and two solid pills side by side read as one control.
 * The type is the quieter of the two.
 */
export const TypeBadge: React.FC<TypeBadgeProps> = ({
  name,
  color,
  size = 'sm',
  className = '',
}) => {
  const tint = color || '#6B7280';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap border ${
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${className}`}
      style={{
        color: tint,
        borderColor: `${tint}66`,
        backgroundColor: `${tint}1A`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tint }} />
      {name || 'No type'}
    </span>
  );
};
