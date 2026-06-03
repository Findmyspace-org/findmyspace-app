"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/space-place/constants";
import { formatActivityDate } from "@/lib/space-place/format";
import type { CrmOrganisation, CrmContact, CrmEngagement, CrmTask } from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card, PageTitle } from "../components/SpacePlaceShell";
import { ContactActionBar } from "../components/ContactActionBar";
import { displayName } from "@/lib/space-place/format";

type OrgRow = CrmOrganisation & {
  assigned_profile?: { full_name: string | null } | null;
};

export default function PipelinePage() {
  const { isAdmin, profile } = useSpacePlace();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [stage, setStage] = useState<PipelineStage>("prospect");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let oq = crmDb.organisations().select("*").order("name");
    if (!isAdmin && profile) {
      oq = oq.eq("assigned_to", profile.id);
    }
    const [oRes, cRes, eRes, tRes, pRes] = await Promise.all([
      oq,
      crmDb.contacts().select("*"),
      crmDb.engagements()
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(200),
      crmDb.tasks()
        .select("*")
        .eq("status", "open")
        .order("due_date", { ascending: true }),
      crmDb.profiles().select("id, full_name"),
    ]);
    const profileMap = Object.fromEntries(
      ((pRes.data as { id: string; full_name: string | null }[]) || []).map(
        (p) => [p.id, p.full_name]
      )
    );
    const orgRows = ((oRes.data as CrmOrganisation[]) || []).map((o) => ({
      ...o,
      assigned_profile: o.assigned_to
        ? { full_name: profileMap[o.assigned_to] || null }
        : null,
    }));
    setOrgs(orgRows);
    setContacts((cRes.data as CrmContact[]) || []);
    setEngagements((eRes.data as CrmEngagement[]) || []);
    setTasks((tRes.data as CrmTask[]) || []);
    setLoading(false);
  }, [isAdmin, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const byStage = useMemo(() => {
    const map = {} as Record<PipelineStage, OrgRow[]>;
    for (const s of PIPELINE_STAGES) map[s] = [];
    for (const o of orgs) {
      map[o.pipeline_stage]?.push(o);
    }
    return map;
  }, [orgs]);

  const stageOrgs = byStage[stage] || [];

  function mainContact(orgId: string) {
    return contacts.find((c) => c.organisation_id === orgId);
  }

  function lastActivity(orgId: string) {
    const e = engagements.find((x) => x.organisation_id === orgId);
    return e ? formatActivityDate(e.occurred_at) : "—";
  }

  function nextTask(orgId: string) {
    const t = tasks.find(
      (x) => x.organisation_id === orgId && x.status === "open"
    );
    return t?.title || "—";
  }

  return (
    <div>
      <PageTitle title="Pipeline" subtitle="Spaces moving toward listing" />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 md:hidden">
        {PIPELINE_STAGES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStage(s)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              stage === s
                ? "bg-[#c1121f] text-white"
                : "bg-white border border-neutral-200"
            }`}
          >
            {PIPELINE_STAGE_LABELS[s]} ({byStage[s].length})
          </button>
        ))}
      </div>

      <div className="hidden md:grid md:grid-cols-7 md:gap-2 md:items-start">
        {PIPELINE_STAGES.map((s) => (
          <div key={s} className="min-w-0">
            <p className="mb-2 text-xs font-bold uppercase text-neutral-500">
              {PIPELINE_STAGE_LABELS[s]}
            </p>
            <div className="space-y-2">
              {byStage[s].map((org) => (
                <OrgPipelineCard
                  key={org.id}
                  org={org}
                  contact={mainContact(org.id)}
                  lastActivity={lastActivity(org.id)}
                  nextTask={nextTask(org.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="md:hidden">
        {loading ? (
          <p className="text-neutral-600">Loading…</p>
        ) : stageOrgs.length === 0 ? (
          <p className="text-neutral-500">No spaces in this stage.</p>
        ) : (
          stageOrgs.map((org) => (
            <OrgPipelineCard
              key={org.id}
              org={org}
              contact={mainContact(org.id)}
              lastActivity={lastActivity(org.id)}
              nextTask={nextTask(org.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function OrgPipelineCard({
  org,
  contact,
  lastActivity,
  nextTask,
}: {
  org: OrgRow;
  contact?: CrmContact;
  lastActivity: string;
  nextTask: string;
}) {
  return (
    <Card className="mb-3">
      <Link href={`/space-place/organisations/${org.id}`}>
        <p className="text-lg font-semibold">{org.name}</p>
      </Link>
      <p className="mt-1 text-sm text-neutral-600">
        {org.assigned_profile?.full_name || "Unassigned"}
      </p>
      {contact ? (
        <p className="text-sm text-neutral-500">
          {displayName(contact.full_name, contact.first_name, contact.last_name)}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-neutral-500">
        Last: {lastActivity} · Next: {nextTask}
      </p>
      <div className="mt-3">
        <ContactActionBar
          phone={contact?.phone}
          whatsapp={contact?.whatsapp}
          email={contact?.email}
          contactId={contact?.id}
        />
        <Link
          href={`/space-place/organisations/${org.id}`}
          className="mt-2 block text-center text-sm font-semibold text-[#c1121f]"
        >
          Open
        </Link>
      </div>
    </Card>
  );
}
