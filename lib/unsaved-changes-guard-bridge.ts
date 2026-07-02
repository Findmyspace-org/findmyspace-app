export type UnsavedGuardPendingNavigation = {
  type: "href" | "back";
  href?: string;
  source?: string;
};

export type UnsavedGuardBridge = {
  isNavigationBlocked: () => boolean;
  requestNavigation: (pending: UnsavedGuardPendingNavigation) => void;
};

let activeBridge: UnsavedGuardBridge | null = null;

/** Register the active page-level unsaved guard (AdminShell / sidebar reads this). */
export function setUnsavedGuardBridge(bridge: UnsavedGuardBridge | null) {
  activeBridge = bridge;
}

export function getUnsavedGuardBridge(): UnsavedGuardBridge | null {
  return activeBridge;
}

/** Context provider or global bridge — whichever is active on the current edit page. */
export function resolveUnsavedGuard(
  ctx: UnsavedGuardBridge | null | undefined
): UnsavedGuardBridge | null {
  if (ctx) return ctx;
  return activeBridge;
}
