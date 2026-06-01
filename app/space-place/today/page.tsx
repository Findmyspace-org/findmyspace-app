"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { dueBucket } from "@/lib/space-place/format";
import type { CrmTaskWithRelations } from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { PageTitle, SectionHeading } from "../components/SpacePlaceShell";
import { TaskCard } from "../components/TaskCard";

const TASK_SELECT = `
  *,
  crm_organisations ( id, name ),
  crm_contacts ( id, full_name, phone, whatsapp, email )
`;

export default function TodayPage() {
  const { profile, isAdmin } = useSpacePlace();
  const [tasks, setTasks] = useState<CrmTaskWithRelations[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = crmDb.tasks()
      .select(TASK_SELECT)
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false });

    if (!isAdmin && profile) {
      q = q.eq("owner_id", profile.id);
    }

    const [{ data }, { data: profs }] = await Promise.all([
      q,
      crmDb.profiles().select("id, full_name"),
    ]);
    const nameMap: Record<string, string> = {};
    for (const p of profs || []) {
      if (p.id) nameMap[p.id] = p.full_name || "Spacer";
    }
    setProfiles(nameMap);
    const enriched = ((data as CrmTaskWithRelations[]) || []).map((t) => ({
      ...t,
      owner_profile: t.owner_id
        ? { id: t.owner_id, full_name: nameMap[t.owner_id] || null }
        : null,
    }));
    setTasks(enriched);
    setLoading(false);
  }, [isAdmin, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const overdue: CrmTaskWithRelations[] = [];
    const today: CrmTaskWithRelations[] = [];
    const upcoming: CrmTaskWithRelations[] = [];
    for (const t of tasks) {
      const bucket = dueBucket(t.due_date, t.status);
      if (bucket === "overdue") overdue.push(t);
      else if (bucket === "today") today.push(t);
      else upcoming.push(t);
    }
    return { overdue, today, upcoming };
  }, [tasks]);

  const greeting = profile?.full_name?.split(" ")[0] || "there";

  return (
    <div>
      <PageTitle
        title={`Good day, ${greeting}`}
        subtitle={format(new Date(), "EEEE, d MMMM")}
      />
      {loading ? (
        <p className="text-neutral-600">Loading tasks…</p>
      ) : (
        <>
          <SectionHeading>Overdue</SectionHeading>
          {grouped.overdue.length === 0 ? (
            <p className="mb-4 text-neutral-500">Nothing overdue.</p>
          ) : (
            grouped.overdue.map((t) => (
              <TaskCard key={t.id} task={t} onUpdated={load} />
            ))
          )}

          <SectionHeading>Due today</SectionHeading>
          {grouped.today.length === 0 ? (
            <p className="mb-4 text-neutral-500">Nothing due today.</p>
          ) : (
            grouped.today.map((t) => (
              <TaskCard key={t.id} task={t} onUpdated={load} />
            ))
          )}

          <SectionHeading>Upcoming</SectionHeading>
          {grouped.upcoming.length === 0 ? (
            <p className="text-neutral-500">No upcoming tasks.</p>
          ) : (
            grouped.upcoming.map((t) => (
              <TaskCard key={t.id} task={t} onUpdated={load} />
            ))
          )}
        </>
      )}
    </div>
  );
}
