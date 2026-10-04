import { hostingHref } from "@/lib/access/hosting-access";
import type { HostRequestContextPayload } from "@/lib/host-request-context-server";

export async function fetchHostRequestContext(
  accessToken: string,
  bookingIds: string[],
  requestedOrganisationId?: string | null
): Promise<HostRequestContextPayload> {
  if (bookingIds.length === 0) {
    return { renters: [], details: [] };
  }

  const path = hostingHref(
    "/api/host/request-context",
    requestedOrganisationId?.trim() || null
  );
  const res = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bookingIds }),
  });
  const json = (await res.json().catch(() => null)) as
    | (HostRequestContextPayload & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(json?.error || "Could not load booking request details.");
  }
  return {
    renters: json?.renters || [],
    details: json?.details || [],
  };
}
