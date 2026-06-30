/** Bump header message/bell counts without a full navigation (same-tab messaging). */
export function broadcastInboxRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fms-inbox-refresh"));
}

/** Refresh admin sidebar module badges and inbox counts. */
export function broadcastAdminBadgeRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fms-admin-badge-refresh"));
}

/** After admin reads or resolves an item, refresh all admin count surfaces. */
export function broadcastAdminInboxRefresh() {
  broadcastInboxRefresh();
  broadcastAdminBadgeRefresh();
}
