"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { crmDb } from "@/lib/space-place/db";
import type { CrmProfile, CrmOrganisation, CrmTask, CrmEngagement } from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card, PageTitle } from "../components/SpacePlaceShell";
import {
  countDuplicateProfileIds,
  dedupeActiveSpacers,
} from "@/lib/space-place/spacers";
import { aggregateTeamStatsByProfileId } from "@/lib/space-place/team-stats";
import { SPACER_INVITE_DISCLAIMER } from "@/lib/space-place/access";

export default function TeamPage() {
  const { isAdmin } = useSpacePlace();
  const router = useRouter();
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [orgs, setOrgs] = useState<CrmOrganisation[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, o, t, e] = await Promise.all([
      crmDb.profiles().select("*").order("full_name"),
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

  const roster = useMemo(
    () => dedupeActiveSpacers(spacers.filter((p) => p.role === "spacer")),
    [spacers]
  );

  const teamStats = useMemo(
    () => aggregateTeamStatsByProfileId(roster, orgs, tasks, engagements),
    [roster, orgs, tasks, engagements]
  );

  useEffect(() => {
    console.info("[Space Place Team]", {
      crmProfilesReturned: spacers.length,
      cardsRendered: teamStats.length,
      duplicateProfileIdsInQuery: countDuplicateProfileIds(spacers),
    });
  }, [spacers, teamStats.length]);

  async function setSpacerActive(profileId: string, active: boolean) {
    setUpdatingId(profileId);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(`/api/space-place/profiles/${profileId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ active }),
    });
    setUpdatingId(null);
    await load();
  }

  if (!isAdmin) return null;

  const admins = spacers.filter((p) => p.role === "admin");

  return (
    <div>
      <PageTitle title="Team" subtitle="Manage Spacers and workload" />
      <p className="mb-4 text-sm text-neutral-500">{SPACER_INVITE_DISCLAIMER}</p>

      <Link
        href="/space-place/team/invite"
        className="mb-6 flex min-h-[48px] items-center justify-center rounded-xl bg-[#c1121f] px-4 py-3 text-base font-semibold text-white"
      >
        Invite Spacer
      </Link>

      {admins.length > 0 ? (
        <>
          <h3 className="mb-2 text-sm font-bold uppercase text-neutral-500">
            Main Admin
          </h3>
          {admins.map((admin) => (
            <Card key={admin.id} className="mb-3">
              <p className="text-lg font-semibold">
                {admin.full_name || admin.email}
              </p>
              <p className="text-sm text-neutral-500">{admin.email}</p>
            </Card>
          ))}
        </>
      ) : null}

      <h3 className="mb-2 mt-4 text-sm font-bold uppercase text-neutral-500">
        Spacers
      </h3>

      {teamStats.length === 0 ? (
        <p className="text-neutral-500">No Spacers yet. Send an invite above.</p>
      ) : (
        teamStats.map((member) => (
          <Card key={member.profile.id} className="mb-3">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/space-place/spacers/${member.profile.id}`}
                className="min-w-0 flex-1"
              >
                <p className="text-lg font-semibold">
                  {member.profile.full_name || member.profile.email}
                </p>
                <p className="text-sm text-neutral-500">{member.profile.email}</p>
              </Link>
              <button
                type="button"
                disabled={updatingId === member.profile.id}
                onClick={() =>
                  setSpacerActive(member.profile.id, !member.profile.active)
                }
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                  member.profile.active
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {member.profile.active ? "Active" : "Inactive"}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <span>Open tasks: {member.openTasks}</span>
              <span>Overdue: {member.overdueTasks}</span>
              <span>Prospects: {member.stageCounts.prospect}</span>
              <span>Signed up: {member.stageCounts.signed_up}</span>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Last activity:{" "}
              {member.lastActivityAt
                ? new Date(member.lastActivityAt).toLocaleDateString()
                : "—"}
            </p>
          </Card>
        ))
      )}
    </div>
  );
}
