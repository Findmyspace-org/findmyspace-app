import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineStage } from "./constants";
import {
  findBestMatch,
  splitContactName,
} from "./smart-capture-match";
import { extractSmartCaptureFields } from "./smart-capture-openai";
import type { SmartCaptureParseResult } from "./smart-capture-types";

type OrgRow = { id: string; name: string };
type ContactRow = {
  id: string;
  organisation_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

export async function parseSmartCaptureText(
  text: string,
  userClient: SupabaseClient
): Promise<SmartCaptureParseResult> {
  const trimmed = text.trim();
  const referenceDate = new Date().toISOString().slice(0, 10);
  const extracted = await extractSmartCaptureFields(trimmed, referenceDate);

  const { data: orgRows } = await (userClient.from("crm_organisations") as any)
    .select("id, name")
    .order("name");

  const organisations = (orgRows as OrgRow[] | null) || [];
  let orgMatch = findBestMatch(
    extracted.organisation_name,
    organisations.map((o) => ({ id: o.id, name: o.name }))
  );

  let contacts: ContactRow[] = [];
  if (orgMatch) {
    const { data: contactRows } = await (userClient.from("crm_contacts") as any)
      .select(
        "id, organisation_id, full_name, first_name, last_name, email, phone"
      )
      .eq("organisation_id", orgMatch.item.id);
    contacts = (contactRows as ContactRow[] | null) || [];
  } else {
    const { data: contactRows } = await (userClient.from("crm_contacts") as any)
      .select(
        "id, organisation_id, full_name, first_name, last_name, email, phone"
      )
      .limit(500);
    contacts = (contactRows as ContactRow[] | null) || [];
  }

  const contactCandidates = contacts.map((c) => ({
    id: c.id,
    name:
      c.full_name?.trim() ||
      [c.first_name, c.last_name].filter(Boolean).join(" ") ||
      "Unnamed",
    row: c,
  }));

  let contactMatch = findBestMatch(
    extracted.contact_name,
    contactCandidates.map((c) => ({ id: c.id, name: c.name }))
  );

  if (contactMatch && !orgMatch) {
    const matchedRow = contactCandidates.find(
      (c) => c.id === contactMatch!.item.id
    )?.row;
    if (matchedRow) {
      const parentOrg = organisations.find(
        (o) => o.id === matchedRow.organisation_id
      );
      if (parentOrg) {
        orgMatch = { item: { id: parentOrg.id, name: parentOrg.name }, score: 1 };
      }
    }
  }

  const orgName =
    extracted.organisation_name?.trim() ||
    orgMatch?.item.name ||
    "New organisation";

  const contactName =
    extracted.contact_name?.trim() ||
    contactMatch?.item.name ||
    "New contact";

  const engagementType =
    extracted.engagement_type &&
    ["call", "whatsapp", "email", "meeting", "note"].includes(
      extracted.engagement_type
    )
      ? extracted.engagement_type
      : "meeting";

  const engagementSummary =
    extracted.engagement_summary?.trim() ||
    extracted.notes?.trim() ||
    trimmed.slice(0, 500);

  return {
    rawText: trimmed,
    extracted,
    organisation: {
      action: orgMatch ? "match" : "create",
      id: orgMatch?.item.id ?? null,
      name: orgMatch?.item.name ?? orgName,
      score: orgMatch?.score,
      pipeline_stage: extracted.pipeline_stage,
      notes: extracted.notes,
    },
    contact: {
      action: contactMatch ? "match" : "create",
      id: contactMatch?.item.id ?? null,
      name: contactMatch?.item.name ?? contactName,
      score: contactMatch?.score,
      email: extracted.email,
      phone: extracted.phone,
    },
    followUp: {
      title: extracted.follow_up_task,
      due_date: extracted.follow_up_date,
    },
    engagement: {
      type: engagementType,
      summary: engagementSummary,
    },
  };
}

export function defaultPipelineStage(
  stage: PipelineStage | null
): PipelineStage {
  return stage ?? "follow_up";
}

export { splitContactName };
