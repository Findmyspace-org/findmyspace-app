import { ownerApiFetch } from "@/lib/owner-api-client";
import type { HostingAccessSummary } from "@/lib/access/hosting-access";

export async function fetchHostingAccessSummary(): Promise<HostingAccessSummary> {
  const json = (await ownerApiFetch("/api/host/access-summary")) as {
    summary: HostingAccessSummary;
  };
  return json.summary;
}
