/**
 * Canonical public origin for absolute URLs (PayFast redirects, emails, server-side fetches).
 * Set `NEXT_PUBLIC_SITE_URL` to your canonical public origin per environment.
 */
export function normalizeSiteUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getPublicSiteUrlFromEnv(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  const normalized = normalizeSiteUrl(raw);

  if (process.env.NODE_ENV === "production") {
    const lower = normalized.toLowerCase();
    if (
      lower.includes("ngrok") ||
      lower.includes("localhost") ||
      lower.includes("127.0.0.1") ||
      lower.includes(".vercel.app")
    ) {
      return null;
    }
  }

  return normalized;
}
