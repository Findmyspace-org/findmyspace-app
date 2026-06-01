"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { crmDb } from "@/lib/space-place/db";
import type { CrmProfile, CrmOrganisation, CrmTask, CrmEngagement } from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card, PageTitle } from "../components/SpacePlaceShell";
import {
  countDuplicateProfileIds,
  dedupeActiveSpacers,
} from "@/lib/space-place/spacers";
import { aggregateTeamStatsByProfileId } from "@/lib/space-place/team-stats";

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

  const roster = useMemo(() => dedupeActiveSpacers(spacers), [spacers]);

  const teamStats = useMemo(
    () => aggregateTeamStatsByProfileId(roster, orgs, tasks, engagements),
    [roster, orgs, tasks, engagements]
  );

  useEffect(() => {
    const duplicateIdRows = countDuplicateProfileIds(spacers);
    console.info("[Space Place Team]", {
      crmProfilesReturned: spacers.length,
      cardsRendered: teamStats.length,
      duplicateProfileIdsInQuery: duplicateIdRows,
      dedupedByEmailOrName: spacers.length - roster.length,
    });
  }, [spacers, roster.length, teamStats.length]);

  if (!isAdmin) return null;

  return (
    <div>
      <PageTitle title="Team" subtitle="Spacers and workload" />
      {process.env.NODE_ENV === "development" ? (
        <p className="mb-3 text-xs text-neutral-500">
          Diagnostic: {spacers.length} profile row(s) from DB → {teamStats.length}{" "}
          card(s) rendered
        </p>
      ) : null}
      {teamStats.map((member) => (
        <Link key={member.profile.id} href={`/space-place/spacers/${member.profile.id}`}>
          <Card className="mb-3 transition active:bg-neutral-50">
            <p className="text-lg font-semibold">
              {member.profile.full_name || member.profile.email}
            </p>
            <p className="text-sm capitalize text-neutral-500">{member.profile.role}</p>
            {member.profile.email ? (
              <p className="text-xs text-neutral-400">{member.profile.email}</p>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <span>Open tasks: {member.openTasks}</span>
              <span>Overdue: {member.overdueTasks}</span>
              <span>Prospects: {member.stageCounts.prospect}</span>
              <span>First contact: {member.stageCounts.first_contact}</span>
              <span>Follow-up: {member.stageCounts.follow_up}</span>
              <span>In progress: {member.stageCounts.in_progress}</span>
              <span>Signed up: {member.stageCounts.signed_up}</span>
              <span>Listed: {member.stageCounts.listed}</span>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Last activity:{" "}
              {member.lastActivityAt
                ? new Date(member.lastActivityAt).toLocaleDateString()
                : "—"}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
