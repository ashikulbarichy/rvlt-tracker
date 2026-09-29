import React from 'react';

/**
 * The loading screen: the "reevolt tasks" lockup centred, a small bar near the bottom.
 * index.html shows the same markup before any script runs, so the hand-over from the
 * static page to this component does not flicker.
 */
export const Splash: React.FC<{ inline?: boolean }> = ({ inline = false }) => (
  <div
    role="status"
    aria-label="Loading Reevolt Tasks"
    className={`${inline ? 'flex-1 relative' : 'fixed inset-0 z-[100]'} flex items-center justify-center bg-bg-base`}
  >
    <img src="/wordmark.svg" alt="" className="h-10 sm:h-11 w-auto select-none" draggable={false} />
    <span className="absolute bottom-6 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-text-tertiary/60 animate-pulse" />
  </div>
);
