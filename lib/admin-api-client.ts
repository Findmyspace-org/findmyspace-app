import { supabase } from "@/lib/supabase";

export async function adminApiFetch(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const raw = await res.text();
  let json: Record<string, unknown> = {};
  if (raw) {
    try {
      json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error(
            "Upload too large. Use images under 4 MB each (JPG, PNG, or WebP)."
          );
        }
        const snippet = raw.replace(/\s+/g, " ").slice(0, 180);
        throw new Error(
          snippet
            ? `Request failed (${res.status}): ${snippet}`
            : `Request failed (${res.status} ${res.statusText || "unknown error"}).`
        );
      }
    }
  }

  if (!res.ok) {
    const message =
      (typeof json.error === "string" && json.error) ||
      (typeof json.message === "string" && json.message) ||
      (res.status === 413
        ? "Upload too large. Use images under 4 MB each (JPG, PNG, or WebP)."
        : null) ||
      (res.statusText ? `${res.statusText} (${res.status})` : null) ||
      `Request failed (${res.status}).`;
    if (res.status === 401) {
      throw new Error("Not signed in. Sign in again as admin.");
    }
    if (res.status === 403) {
      throw new Error("Admin access required.");
    }
    throw new Error(message);
  }
  return json;
}
