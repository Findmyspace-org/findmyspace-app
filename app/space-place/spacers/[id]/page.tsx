"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { CrmProfile, CrmOrganisation, CrmTask, CrmEngagement } from "@/lib/space-place/types";
import { useSpacePlace } from "../../SpacePlaceContext";
import { Card, PageTitle, SectionHeading } from "../../components/SpacePlaceShell";
import { formatDateTime } from "@/lib/space-place/format";

export default function SpacerDetailPage() {
  const { isAdmin } = useSpacePlace();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [spacer, setSpacer] = useState<CrmProfile | null>(null);
  const [orgs, setOrgs] = useState<CrmOrganisation[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);

  const load = useCallback(async () => {
    const [p, o, t, e] = await Promise.all([
      crmDb.profiles().select("*").eq("id", id).single(),
      crmDb.organisations().select("*").eq("assigned_to", id),
      crmDb.tasks().select("*").eq("owner_id", id).order("due_date"),
      crmDb.engagements()
        .select("*")
        .eq("created_by", id)
        .order("occurred_at", { ascending: false })
        .limit(30),
    ]);
    setSpacer((p.data as CrmProfile) || null);
    setOrgs((o.data as CrmOrganisation[]) || []);
    setTasks((t.data as CrmTask[]) || []);
    setEngagements((e.data as CrmEngagement[]) || []);
  }, [id]);

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/space-place/today");
      return;
    }
    load();
  }, [isAdmin, load, router]);

  if (!isAdmin) return null;

  if (!spacer) {
    return <p className="text-neutral-600">Loading…</p>;
  }

  return (
    <div>
      <PageTitle title={spacer.full_name || "Spacer"} subtitle="Assigned work" />

      <SectionHeading>Assigned prospects</SectionHeading>
      {orgs.map((o) => (
        <Link key={o.id} href={`/space-place/organisations/${o.id}`}>
          <Card className="mb-2">{o.name}</Card>
        </Link>
      ))}

      <SectionHeading>Tasks</SectionHeading>
      {tasks.map((t) => (
        <Card key={t.id} className="mb-2">
          <p className="font-semibold">{t.title}</p>
          <p className="text-sm text-neutral-500">{t.due_date} · {t.status}</p>
        </Card>
      ))}

      <SectionHeading>Recent engagements</SectionHeading>
      {engagements.map((e) => (
        <Card key={e.id} className="mb-2">
          <p className="text-xs text-neutral-500">{formatDateTime(e.occurred_at)}</p>
          <p>{e.summary}</p>
        </Card>
      ))}
    </div>
  );
}
