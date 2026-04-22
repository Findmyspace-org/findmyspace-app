type SupabaseProjectInfo = {
  projectRef: string;
  hostname: string;
};

export function getSupabaseProjectInfo(): SupabaseProjectInfo | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname;
    const firstLabel = hostname.split(".")[0] || "";
    const projectRef = firstLabel || "unknown";
    return { projectRef, hostname };
  } catch {
    return null;
  }
}

export function logAuthDiagnostic(
  event: string,
  extra: Record<string, string | number | boolean | null | undefined> = {}
) {
  const info = getSupabaseProjectInfo();
  const payload: Record<string, string | number | boolean | null | undefined> = {
    supabase_project_ref: info?.projectRef || "unknown",
    supabase_hostname: info?.hostname || "unknown",
    ...extra,
  };
  console.info(`[auth][${event}]`, payload);
}

