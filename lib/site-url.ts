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

export const FIND_MYSPACE_PRODUCTION_ORIGIN = "https://findmyspace.co.za";

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isProductionFindMySpaceHost(hostname: string): boolean {
  return hostname === "findmyspace.co.za" || hostname === "www.findmyspace.co.za";
}

/**
 * Canonical URL used for outbound links (emails, payment redirects).
 * In production, always falls back to live domain if env is missing/unsafe.
 */
export function getCanonicalPublicSiteUrl(): string {
  const envUrl = getPublicSiteUrlFromEnv();
  if (envUrl) {
    const host = hostnameOf(envUrl);
    if (host && isProductionFindMySpaceHost(host)) {
      return FIND_MYSPACE_PRODUCTION_ORIGIN;
    }
    return envUrl;
  }
  if (process.env.NODE_ENV === "production") {
    return FIND_MYSPACE_PRODUCTION_ORIGIN;
  }
  return "http://localhost:3000";
}

/**
 * PayFast return/cancel/notify origin. Never derived from Host / X-Forwarded-Host.
 * Preview deployments must not point sandbox ITNs at production.
 */
export function getPayFastCallbackBaseUrl(): string | null {
  const vercelEnv = process.env.VERCEL_ENV?.trim();

  if (vercelEnv === "preview") {
    return null;
  }

  if (vercelEnv === "production") {
    return FIND_MYSPACE_PRODUCTION_ORIGIN;
  }

  if (process.env.VERCEL && process.env.NODE_ENV === "production") {
    return FIND_MYSPACE_PRODUCTION_ORIGIN;
  }

  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      const normalized = normalizeSiteUrl(raw);
      const parsed = new URL(normalized);
      const host = parsed.hostname.toLowerCase();
      if (isProductionFindMySpaceHost(host)) {
        if (parsed.protocol !== "https:") return null;
        return FIND_MYSPACE_PRODUCTION_ORIGIN;
      }
      if (host.includes(".vercel.app")) {
        return null;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }
      return parsed.origin.replace(/\/+$/, "");
    } catch {
      return null;
    }
  }

  return "http://localhost:3000";
}
