"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PIPELINE_STAGES } from "@/lib/space-place/constants";
import type { CrmProfile, CrmOrganisation, CrmTask, CrmEngagement } from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card, PageTitle } from "../components/SpacePlaceShell";
import { dueBucket } from "@/lib/space-place/format";
import { dedupeActiveSpacers } from "@/lib/space-place/spacers";

export default function TeamPage() {
  const { isAdmin } = useSpacePlace();
  const router = useRouter();
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [orgs, setOrgs] = useState<CrmOrganisation[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);

  const load = useCallback(async () => {
    const [p, o, t, e] = await Promise.all([
      crmDb.profiles().select("*").eq("active", true).order("full_name"),
      crmDb.organisations().select("*"),
      crmDb.tasks().select("*").eq("status", "open"),
      crmDb.engagements()
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
    ]);
    setSpacers((p.data as CrmProfile[]) || []);
    setOrgs((o.data as CrmOrganisation[]) || []);
    setTasks((t.data as CrmTask[]) || []);
    setEngagements((e.data as CrmEngagement[]) || []);
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/space-place/today");
      return;
    }
    load();
  }, [isAdmin, load, router]);

  if (!isAdmin) return null;

  const roster = dedupeActiveSpacers(spacers);

  return (
    <div>
      <PageTitle title="Team" subtitle="Spacers and workload" />
      {roster.map((s) => {
        const assigned = orgs.filter((o) => o.assigned_to === s.id);
        const openTasks = tasks.filter((t) => t.owner_id === s.id);
        const overdue = openTasks.filter(
          (t) => dueBucket(t.due_date, t.status) === "overdue"
        );
        const stageCounts = Object.fromEntries(
          PIPELINE_STAGES.map((st) => [
            st,
            assigned.filter((o) => o.pipeline_stage === st).length,
          ])
        );
        const lastEng = engagements.find((e) => e.created_by === s.id);
        return (
          <Link key={s.id} href={`/space-place/spacers/${s.id}`}>
            <Card className="mb-3 transition active:bg-neutral-50">
              <p className="text-lg font-semibold">{s.full_name || s.email}</p>
              <p className="text-sm capitalize text-neutral-500">{s.role}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <span>Open tasks: {openTasks.length}</span>
                <span>Overdue: {overdue.length}</span>
                <span>Prospects: {stageCounts.prospect}</span>
                <span>First contact: {stageCounts.first_contact}</span>
                <span>Follow-up: {stageCounts.follow_up}</span>
                <span>In progress: {stageCounts.in_progress}</span>
                <span>Signed up: {stageCounts.signed_up}</span>
                <span>Listed: {stageCounts.listed}</span>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Last activity:{" "}
                {lastEng
                  ? new Date(lastEng.occurred_at).toLocaleDateString()
                  : "—"}
              </p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
