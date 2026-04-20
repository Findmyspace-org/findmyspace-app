/**
 * Canonical public origin for absolute URLs (PayFast redirects, emails, server-side fetches).
 * Set `NEXT_PUBLIC_SITE_URL` per environment (e.g. https://findmyspace-alpha.vercel.app in production).
 */
export function normalizeSiteUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getPublicSiteUrlFromEnv(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  return normalizeSiteUrl(raw);
}
