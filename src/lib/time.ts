/**
 * Formats timestamps app-wide according to precision rules:
 * - 0 to 59 minutes: "Just now" or "Xm ago" (e.g. "Updated 5m ago" / "12m ago")
 * - 1 to 23 hours: "Xh ago" (e.g. "Updated 2h ago")
 * - 1 to 29 days: "Xd ago" (e.g. "Updated 3d ago")
 * - 1 month+ (>= 30 days): "Xmo Yd ago" (e.g. "Updated 1mo 4d ago" or "2mo ago")
 */
export function formatRelativeTime(
  dateInput: string | number | Date | null | undefined,
  options?: { prefix?: string }
): string {
  if (!dateInput) return options?.prefix ? `${options.prefix} just now` : 'Just now';

  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return options?.prefix ? `${options.prefix} just now` : 'Just now';

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let timeString = '';

  if (diffMinutes < 1) {
    timeString = 'just now';
  } else if (diffMinutes <= 59) {
    timeString = `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    timeString = `${diffHours}h ago`;
  } else if (diffDays < 30) {
    timeString = `${diffDays}d ago`;
  } else {
    const months = Math.floor(diffDays / 30);
    const remainingDays = diffDays % 30;
    if (remainingDays > 0) {
      timeString = `${months}mo ${remainingDays}d ago`;
    } else {
      timeString = `${months}mo ago`;
    }
  }

  if (options?.prefix) {
    return `${options.prefix} ${timeString}`;
  }

  return timeString;
}
