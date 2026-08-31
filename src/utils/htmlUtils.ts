export const stripHtml = (html: string | undefined | null): string => {
  if (!html) return '';
  // Use a DOM parser if in browser environment
  if (typeof window !== 'undefined' && window.DOMParser) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  }
  // Fallback regex (basic stripping)
  return html.replace(/<[^>]*>?/gm, '');
};
