import { useCallback, useState } from 'react';

export type DocWidth = 'compact' | 'full';

const KEY = 'doc-width';

const read = (): DocWidth => {
  try {
    return localStorage.getItem(KEY) === 'full' ? 'full' : 'compact';
  } catch {
    return 'compact';
  }
};

/** Reading width for documents, remembered per browser. A viewer preference, not data. */
export function useDocWidth() {
  const [width, setWidthState] = useState<DocWidth>(read);
  const setWidth = useCallback((next: DocWidth) => {
    setWidthState(next);
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked: keep it for this visit */ }
  }, []);
  return { width, setWidth };
}
