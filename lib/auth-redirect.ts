export const DEFAULT_AUTH_REDIRECT_PATH = "/dashboard";

/** Login, signup, and OAuth callback routes — never block with edit-form guards. */
export function isAuthRelatedPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/auth")
  );
}

export function sanitizeNextPath(
  rawNext: string | null | undefined,
  fallback: string = DEFAULT_AUTH_REDIRECT_PATH
): string {
  if (!rawNext) return fallback;

  const trimmed = rawNext.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;

  return trimmed;
}

export function buildModalLoginUrl(appBaseUrl: string, nextPath: string): string {
  const safeNext = sanitizeNextPath(nextPath);
  return `${appBaseUrl}/?login=1&next=${encodeURIComponent(safeNext)}`;
}
