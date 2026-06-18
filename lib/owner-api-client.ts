import { supabase } from "@/lib/supabase";
import { parseApiFetchError } from "@/lib/api-fetch-errors";

export async function ownerApiFetch(path: string, init?: RequestInit) {
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
        throw new Error(parseApiFetchError(res, raw, json));
      }
    }
  }

  if (!res.ok) {
    throw new Error(parseApiFetchError(res, raw, json));
  }

  if (json.ok === false) {
    throw new Error(
      (typeof json.error === "string" && json.error) || "Request failed."
    );
  }

  return json;
}
