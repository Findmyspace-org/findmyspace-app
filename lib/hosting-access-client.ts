import { ownerApiFetch } from "@/lib/owner-api-client";
import type { HostingAccessSummary } from "@/lib/access/hosting-access";
import type { HostingOrganisationName } from "@/lib/workspace-switch";

export async function fetchHostingWorkspaceDisplay(): Promise<{
  summary: HostingAccessSummary;
  organisations: HostingOrganisationName[];
}> {
  const json = (await ownerApiFetch("/api/host/access-summary")) as {
    summary: HostingAccessSummary;
    organisations?: HostingOrganisationName[];
  };
  return {
    summary: json.summary,
    organisations: json.organisations || [],
  };
}

export async function fetchHostingAccessSummary(): Promise<HostingAccessSummary> {
  return (await fetchHostingWorkspaceDisplay()).summary;
}
