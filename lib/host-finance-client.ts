import { hostingHref } from "@/lib/access/hosting-access";
import type { HostFinancePayload } from "@/lib/host-finance-server";
import { supabase } from "@/lib/supabase";

const HOST_FINANCE_TIMEOUT_MS = 20_000;

export async function fetchHostFinance(
  requestedOrganisationId?: string | null
): Promise<HostFinancePayload> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const path = hostingHref(
    "/api/host/finance",
    requestedOrganisationId?.trim() || null
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOST_FINANCE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Finance data took too long to load.");
    }
    throw error instanceof Error
      ? error
      : new Error("Could not load finance data.");
  } finally {
    clearTimeout(timer);
  }

  const json = (await res.json().catch(() => null)) as {
    spaces?: HostFinancePayload["spaces"];
    bookings?: HostFinancePayload["bookings"];
    error?: string;
  } | null;

  if (!res.ok) {
    throw new Error(json?.error || "Could not load finance data.");
  }

  return {
    spaces: json?.spaces || [],
    bookings: json?.bookings || [],
  };
}
