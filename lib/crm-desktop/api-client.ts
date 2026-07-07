import { adminApiFetch } from "@/lib/admin-api-client";
import type {
  CrmContactListRow,
  CrmOrganisationListRow,
  CrmOverviewStats,
  CrmPipelineListRow,
  CrmPipelineStageCounts,
  CrmSearchResultGroup,
  CrmSpaceListRow,
  CrmTaskListRow,
  PaginatedResult,
} from "./types";

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchCrmDesktopOverview() {
  const json = await adminApiFetch("/api/admin/crm/desktop/overview");
  return json.stats as CrmOverviewStats;
}

export async function fetchCrmDesktopOrganisations(
  params: Record<string, string | number | boolean | undefined> = {}
) {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/organisations${buildQuery(params)}`
  );
  return json as PaginatedResult<CrmOrganisationListRow>;
}

export async function fetchCrmDesktopContacts(
  params: Record<string, string | number | boolean | undefined> = {}
) {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/contacts${buildQuery(params)}`
  );
  return json as PaginatedResult<CrmContactListRow>;
}

export async function fetchCrmDesktopTasks(
  params: Record<string, string | number | boolean | undefined> = {}
) {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/tasks${buildQuery(params)}`
  );
  return json as PaginatedResult<CrmTaskListRow>;
}

export async function fetchCrmDesktopPipeline(
  params: Record<string, string | number | boolean | undefined> = {}
) {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/pipeline${buildQuery(params)}`
  );
  return json as PaginatedResult<CrmPipelineListRow> & {
    stageCounts?: CrmPipelineStageCounts;
  };
}

export async function fetchCrmDesktopPipelineStageCounts(
  params: Record<string, string | number | boolean | undefined> = {}
) {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/pipeline${buildQuery({ ...params, counts: "1" })}`
  );
  return json.stageCounts as CrmPipelineStageCounts;
}

export async function fetchCrmDesktopBoardOrganisations(
  params: Record<string, string | number | boolean | undefined> = {}
) {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/organisations${buildQuery({ ...params, board: "1", pageSize: params.pageSize ?? 100 })}`
  );
  return json as PaginatedResult<CrmOrganisationListRow>;
}

export async function reorderCrmPipelineCard(input: {
  organisationId: string;
  pipelineStage: string;
  beforeOrganisationId?: string | null;
  afterOrganisationId?: string | null;
  sortMode?: string;
}) {
  return adminApiFetch("/api/admin/crm/desktop/pipeline/reorder", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function moveCrmPipelineOrganisationStage(input: {
  organisationId: string;
  previousStage: string;
  destinationStage: string;
  beforeOrganisationId?: string | null;
  afterOrganisationId?: string | null;
  contactId?: string | null;
  idempotencyKey: string;
  sortMode?: string;
}) {
  return adminApiFetch("/api/admin/crm/desktop/pipeline/move-stage", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchCrmDesktopSpaces(
  params: Record<string, string | number | boolean | undefined> = {}
) {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/spaces${buildQuery(params)}`
  );
  return json as PaginatedResult<CrmSpaceListRow>;
}

export async function fetchCrmDesktopSearch(q: string) {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/search${buildQuery({ q })}`
  );
  return json.groups as CrmSearchResultGroup[];
}

export async function setCrmOrganisationPrimaryContact(
  organisationId: string,
  contactId: string | null
) {
  return adminApiFetch(
    `/api/admin/crm/desktop/organisations/${organisationId}/primary-contact`,
    {
      method: "POST",
      body: JSON.stringify({ contactId }),
    }
  );
}

export async function fetchCrmDesktopProfiles() {
  const json = await adminApiFetch("/api/admin/crm/desktop/profiles");
  return json.profiles as { id: string; full_name: string | null; role: string }[];
}
