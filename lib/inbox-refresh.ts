/** Bump header message/bell counts without a full navigation (same-tab messaging). */
export function broadcastInboxRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fms-inbox-refresh"));
}
