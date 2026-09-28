import React from 'react';

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, { mark: string; text: string; gap: string }> = {
  sm: { mark: 'w-5 h-5', text: 'text-sm', gap: 'gap-1.5' },
  md: { mark: 'w-7 h-7', text: 'text-base', gap: 'gap-2' },
  lg: { mark: 'w-12 h-12', text: 'text-3xl', gap: 'gap-3' },
};

/** The Reevolt mark followed by "Tasks": the product's name wherever the logo appears. */
export const BrandLockup: React.FC<{ size?: Size; className?: string }> = ({ size = 'md', className = '' }) => {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center ${s.gap} shrink-0 ${className}`}>
      <img src="/logo.svg" alt="" aria-hidden="true" className={`${s.mark} shrink-0`} />
      <span className={`${s.text} font-karla font-semibold tracking-tight text-text-primary leading-none`}>Tasks</span>
      <span className="sr-only">Reevolt Tasks</span>
    </span>
  );
};
