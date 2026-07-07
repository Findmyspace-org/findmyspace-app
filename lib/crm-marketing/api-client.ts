import { adminApiFetch } from "@/lib/admin-api-client";
import type {
  CrmMarketingContactDetail,
  CrmMarketingContactRow,
  CrmMarketingListRow,
  CrmMarketingOverviewStats,
  RecipientPreviewResult,
} from "./types";

export async function fetchMarketingOverviewStats() {
  const json = await adminApiFetch("/api/admin/crm/marketing/overview");
  return json.stats as CrmMarketingOverviewStats;
}

export async function fetchMarketingContacts(
  params: Record<string, string | number | undefined> = {}
) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const qs = search.toString();
  const json = await adminApiFetch(
    `/api/admin/crm/marketing/contacts${qs ? `?${qs}` : ""}`
  );
  return json as {
    rows: CrmMarketingContactRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export async function fetchMarketingContactDetail(id: string) {
  const json = await adminApiFetch(`/api/admin/crm/marketing/contacts/${id}`);
  return json.contact as CrmMarketingContactDetail;
}

export async function postMarketingContactAction(
  id: string,
  body: Record<string, unknown>
) {
  return adminApiFetch(`/api/admin/crm/marketing/contacts/${id}/actions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function postMarketingBulkAction(body: Record<string, unknown>) {
  return adminApiFetch("/api/admin/crm/marketing/contacts/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchMarketingLists(includeArchived = false) {
  const json = await adminApiFetch("/api/admin/crm/marketing/lists");
  const lists = json.lists as CrmMarketingListRow[];
  return includeArchived ? lists : lists.filter((list) => list.active);
}

export async function createMarketingList(body: { name: string; description?: string }) {
  const json = await adminApiFetch("/api/admin/crm/marketing/lists", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return json.list as CrmMarketingListRow;
}

export async function fetchMarketingListDetail(
  id: string,
  page = 1,
  pageSize = 25
) {
  const json = await adminApiFetch(
    `/api/admin/crm/marketing/lists/${id}?page=${page}&pageSize=${pageSize}`
  );
  return json as {
    list: CrmMarketingListRow;
    rows: Array<{
      marketing_contact_id: string;
      crm_contact_id: string;
      contact_name: string;
      organisation_name: string | null;
      role: string | null;
      email: string | null;
      status: string;
      sendable: boolean;
      eligibility_reason: string;
      added_at: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
  };
}

export async function updateMarketingList(
  id: string,
  body: Record<string, unknown>
) {
  return adminApiFetch(`/api/admin/crm/marketing/lists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function previewMarketingRecipients(body: Record<string, unknown>) {
  const json = await adminApiFetch("/api/admin/crm/marketing/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return json.preview as RecipientPreviewResult;
}

export async function saveMarketingCampaignDraft(body: Record<string, unknown>) {
  return adminApiFetch("/api/admin/crm/marketing/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function marketingContactsExportUrl(
  params: Record<string, string | undefined>
) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) search.set(k, v);
  }
  const qs = search.toString();
  return `/api/admin/crm/marketing/contacts/export${qs ? `?${qs}` : ""}`;
}
