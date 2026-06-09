/** Whole days elapsed since an ISO timestamp (floor, minimum 0). */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function formatOldestWaiting(days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null;
  if (days === 0) return "Oldest waiting: less than 1 day";
  if (days === 1) return "Oldest waiting: 1 day";
  return `Oldest waiting: ${days} days`;
}
