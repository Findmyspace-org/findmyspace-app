/**
 * Caps for finance aggregation queries (owner dashboard + admin API + CSV).
 * Keeps payload and client work bounded; increase only with pagination or streaming.
 */
export const FINANCE_BOOKINGS_QUERY_LIMIT = 8000;
