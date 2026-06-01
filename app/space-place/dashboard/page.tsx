"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from "@/lib/space-place/constants";
import { dueBucket } from "@/lib/space-place/format";
import type { CrmOrganisation, CrmTask, CrmProfile, CrmEngagement } from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card, PageTitle, SectionHeading } from "../components/SpacePlaceShell";

export default function DashboardPage() {
  const { isAdmin, profile } = useSpacePlace();
  const [orgs, setOrgs] = useState<CrmOrganisation[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);

  const load = useCallback(async () => {
    let oq = crmDb.organisations().select("*");
    let tq = crmDb.tasks().select("*");
    let eq = crmDb.engagements()
      .select("*")
      .gte("occurred_at", new Date(Date.now() - 7 * 86400000).toISOString());

    if (!isAdmin && profile) {
      oq = oq.eq("assigned_to", profile.id);
      tq = tq.eq("owner_id", profile.id);
      eq = eq.eq("created_by", profile.id);
    }

    const [o, t, e, p] = await Promise.all([
      oq,
      tq,
      eq,
      isAdmin
        ? crmDb.profiles().select("*").eq("active", true)
        : Promise.resolve({ data: [] }),
    ]);
    setOrgs((o.data as CrmOrganisation[]) || []);
    setTasks((t.data as CrmTask[]) || []);
    setEngagements((e.data as CrmEngagement[]) || []);
    setSpacers((p.data as CrmProfile[]) || []);
  }, [isAdmin, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of PIPELINE_STAGES) counts[s] = 0;
    for (const o of orgs) counts[o.pipeline_stage] = (counts[o.pipeline_stage] || 0) + 1;
    return counts;
  }, [orgs]);

  const openTasks = tasks.filter((t) => t.status === "open");
  const overdue = openTasks.filter(
    (t) => dueBucket(t.due_date, t.status) === "overdue"
  );
  const dueToday = openTasks.filter(
    (t) => dueBucket(t.due_date, t.status) === "today"
  );

  const mySignedUp = orgs.filter((o) => o.pipeline_stage === "signed_up");
  const myListed = orgs.filter((o) => o.pipeline_stage === "listed");

  return (
    <div>
      <PageTitle
        title={isAdmin ? "Admin dashboard" : "My dashboard"}
        subtitle="Pipeline and task overview"
      />

      {!isAdmin ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Overdue" value={overdue.length} href="/space-place/today" />
            <StatCard label="Due today" value={dueToday.length} href="/space-place/today" />
            <StatCard label="Prospects" value={stageCounts.prospect || 0} href="/space-place/prospects" />
            <StatCard label="Signed up" value={mySignedUp.length} />
            <StatCard label="Listed" value={myListed.length} />
          </div>
          <SectionHeading>My pipeline</SectionHeading>
          {PIPELINE_STAGES.map((s) => (
            <div key={s} className="mb-2 flex justify-between text-sm">
              <span>{PIPELINE_STAGE_LABELS[s]}</span>
              <span className="font-semibold">{stageCounts[s] || 0}</span>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PIPELINE_STAGES.map((s) => (
              <StatCard
                key={s}
                label={PIPELINE_STAGE_LABELS[s]}
                value={stageCounts[s] || 0}
                href="/space-place/pipeline"
              />
            ))}
            <StatCard label="Overdue tasks" value={overdue.length} href="/space-place/tasks?filter=overdue" />
            <StatCard label="Due today" value={dueToday.length} href="/space-place/tasks?filter=today" />
          </div>

          <SectionHeading>Performance by Spacer</SectionHeading>
          {spacers.map((s) => {
            const assigned = orgs.filter((o) => o.assigned_to === s.id);
            const spacerTasks = openTasks.filter((t) => t.owner_id === s.id);
            const spacerOverdue = spacerTasks.filter(
              (t) => dueBucket(t.due_date, t.status) === "overdue"
            );
            const recent = engagements.filter((e) => e.created_by === s.id).length;
            const last = engagements
              .filter((e) => e.created_by === s.id)
              .sort(
                (a, b) =>
                  new Date(b.occurred_at).getTime() -
                  new Date(a.occurred_at).getTime()
              )[0];
            return (
              <Card key={s.id} className="mb-3">
                <Link
                  href={`/space-place/spacers/${s.id}`}
                  className="text-lg font-semibold text-[#c1121f]"
                >
                  {s.full_name}
                </Link>
                <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                  <span>Open tasks: {spacerTasks.length}</span>
                  <span>Overdue: {spacerOverdue.length}</span>
                  <span>Prospects: {assigned.filter((o) => o.pipeline_stage === "prospect").length}</span>
                  <span>Signed up: {assigned.filter((o) => o.pipeline_stage === "signed_up").length}</span>
                  <span>Listed: {assigned.filter((o) => o.pipeline_stage === "listed").length}</span>
                  <span>Activity (7d): {recent}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Last activity:{" "}
                  {last ? new Date(last.occurred_at).toLocaleDateString() : "—"}
                </p>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <Card className="text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs font-medium text-neutral-600">{label}</p>
    </Card>
  );
  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}
