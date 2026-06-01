import { format, formatDistanceToNow, isPast, isToday, parseISO } from "date-fns";

export function displayName(
  fullName: string | null | undefined,
  firstName?: string | null,
  lastName?: string | null
): string {
  if (fullName?.trim()) return fullName.trim();
  const parts = [firstName, lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : "Unnamed";
}

/** Prefer explicit full name; otherwise first + last. */
export function resolveContactFullName(
  fullName: string,
  firstName: string,
  lastName: string
): string {
  const trimmed = fullName.trim();
  if (trimmed) return trimmed;
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

export function contactNameIsValid(
  fullName: string,
  firstName: string,
  lastName: string
): boolean {
  return Boolean(
    fullName.trim() || firstName.trim() || lastName.trim()
  );
}

export function formatDueDate(dueDate: string | null | undefined): string {
  if (!dueDate) return "No date";
  const d = parseISO(dueDate.length === 10 ? `${dueDate}T12:00:00` : dueDate);
  if (isToday(d)) return "Today";
  return format(d, "EEE d MMM");
}

export function dueBucket(
  dueDate: string | null | undefined,
  status: string
): "overdue" | "today" | "upcoming" | "done" | "none" {
  if (status === "done" || status === "cancelled") return "done";
  if (!dueDate) return "none";
  const d = parseISO(dueDate.length === 10 ? `${dueDate}T23:59:59` : dueDate);
  if (isPast(d) && !isToday(d)) return "overdue";
  if (isToday(d)) return "today";
  return "upcoming";
}

export function formatActivityDate(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

export function formatDateTime(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy, HH:mm");
}
