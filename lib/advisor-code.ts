/** Browser storage for ?advisor= referral code (first-touch; not secret). */

export const PENDING_ADVISOR_STORAGE_KEY = "findmyspace_pending_advisor_code";

export function normalizeAdvisorCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().toUpperCase();
  if (t.length < 2 || t.length > 32) return null;
  if (!/^[A-Z0-9_-]+$/.test(t)) return null;
  return t;
}

export function getPendingAdvisorCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeAdvisorCode(localStorage.getItem(PENDING_ADVISOR_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function setPendingAdvisorCode(code: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!code) {
      localStorage.removeItem(PENDING_ADVISOR_STORAGE_KEY);
    } else {
      const n = normalizeAdvisorCode(code);
      if (n) localStorage.setItem(PENDING_ADVISOR_STORAGE_KEY, n);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Persist ?advisor= from URL into localStorage and remove param from address bar
 * (value remains in storage for signup → listing).
 */
export function persistPendingAdvisorCodeFromUrl(raw: string | null): void {
  const code = normalizeAdvisorCode(raw);
  if (!code) return;
  setPendingAdvisorCode(code);
  if (typeof window === "undefined" || !window.history.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("advisor")) return;
    url.searchParams.delete("advisor");
    const next = url.pathname + (url.search ? url.search : "") + url.hash;
    window.history.replaceState({}, "", next);
  } catch {
    /* ignore */
  }
}

export function buildAdvisorReferralPath(basePath: string, code: string): string {
  const n = normalizeAdvisorCode(code);
  if (!n) return basePath;
  const sep = basePath.includes("?") ? "&" : "?";
  return `${basePath}${sep}advisor=${encodeURIComponent(n)}`;
}

/** Full URL for QR and copy-link (same canonical target as Phase 1 listing flow). */
export function getCanonicalAdvisorReferralUrl(
  siteBaseUrl: string,
  code: string
): string {
  const base = siteBaseUrl.replace(/\/+$/, "");
  const path = buildAdvisorReferralPath("/dashboard/new-space", code);
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}
