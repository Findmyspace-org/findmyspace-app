import { adminApiFetch } from "@/lib/admin-api-client";
import type {
  CompletedActionListFilters,
  CreateCompletedActionInput,
  CrmCompletedActionRow,
  UpdateCompletedActionInput,
} from "./completed-actions-mutations";

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchCompletedActions(
  filters: CompletedActionListFilters = {}
): Promise<CrmCompletedActionRow[]> {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/completed-actions${buildQuery({
      organisationId: filters.organisationId,
      propertyId: filters.propertyId || undefined,
      spaceId: filters.spaceId || undefined,
      q: filters.q,
      kind: filters.kind && filters.kind !== "all" ? filters.kind : undefined,
      completedBy: filters.completedBy,
      from: filters.from,
      to: filters.to,
    })}`
  );
  return (json.rows as CrmCompletedActionRow[]) || [];
}

export async function fetchCompletedActionState(input: {
  organisationId: string;
  propertyId?: string | null;
  spaceId?: string | null;
  actionKeys?: string[];
}): Promise<Record<string, CrmCompletedActionRow | null>> {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/completed-actions/state${buildQuery({
      organisationId: input.organisationId,
      propertyId: input.propertyId || undefined,
      spaceId: input.spaceId || undefined,
      keys: input.actionKeys?.join(","),
    })}`
  );
  return (json.state as Record<string, CrmCompletedActionRow | null>) || {};
}

export async function createCompletedActionApi(
  input: CreateCompletedActionInput
): Promise<CrmCompletedActionRow> {
  const json = await adminApiFetch("/api/admin/crm/desktop/completed-actions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return json.row as CrmCompletedActionRow;
}

export async function updateCompletedActionApi(
  id: string,
  input: UpdateCompletedActionInput
): Promise<CrmCompletedActionRow> {
  const json = await adminApiFetch(
    `/api/admin/crm/desktop/completed-actions/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    }
  );
  return json.row as CrmCompletedActionRow;
}

export async function removeCompletedActionApi(id: string): Promise<void> {
  await adminApiFetch(`/api/admin/crm/desktop/completed-actions/${id}`, {
    method: "DELETE",
  });
}
