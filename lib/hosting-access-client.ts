import { hostingHref } from "@/lib/access/hosting-access";
import { ownerApiFetch } from "@/lib/owner-api-client";
import type { HostingAccessSummary } from "@/lib/access/hosting-access";
import type { HostingOrganisationName } from "@/lib/workspace-switch";

export async function fetchHostingWorkspaceDisplay(
  requestedOrganisationId?: string | null
): Promise<{
  summary: HostingAccessSummary;
  organisations: HostingOrganisationName[];
}> {
  const json = (await ownerApiFetch(
    hostingHref(
      "/api/host/access-summary",
      requestedOrganisationId?.trim() || null
    )
  )) as {
    summary: HostingAccessSummary;
    organisations?: HostingOrganisationName[];
  };
  return {
    summary: json.summary,
    organisations: json.organisations || [],
  };
}

export async function fetchHostingAccessSummary(
  requestedOrganisationId?: string | null
): Promise<HostingAccessSummary> {
  return (await fetchHostingWorkspaceDisplay(requestedOrganisationId)).summary;
}
