/** CRM business timezone for due-date grouping (South Africa). */
export const CRM_BUSINESS_TIMEZONE = "Africa/Johannesburg";

/**
 * Returns YYYY-MM-DD for "today" in the CRM business timezone.
 * Task due_date values are date-only strings stored without timezone.
 */
export function crmTodayIsoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
