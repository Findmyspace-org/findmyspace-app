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

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (typeof json.error === "string" && json.error) ||
      res.statusText ||
      "Request failed.";
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
