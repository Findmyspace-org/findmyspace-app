"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { dueBucket } from "@/lib/space-place/format";
import { FIELD_CLASS, LABEL_CLASS } from "@/lib/space-place/form-ui";
import type {
  CrmTaskWithRelations,
  CrmProfile,
  CrmOrganisation,
  CrmContact,
} from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { PageTitle, SectionHeading } from "../components/SpacePlaceShell";
import { TaskCard } from "../components/TaskCard";
import type { TaskReassignResult } from "../components/TaskReassignControl";
import {
  dedupeActiveSpacers,
  formatSpacerOptionLabel,
} from "@/lib/space-place/spacers";

export type TodayView = "my" | "all" | { profileId: string };

const TASK_SELECT = `
  *,
  crm_organisations ( id, name, pipeline_stage ),
  crm_contacts ( id, full_name, phone, whatsapp, email )
`;

function viewSelectValue(view: TodayView): string {
  if (view === "my") return "my";
  if (view === "all") return "all";
  return view.profileId;
}

function viewFromSelectValue(value: string): TodayView {
  if (value === "my") return "my";
  if (value === "all") return "all";
  return { profileId: value };
}

export default function TodayPage() {
  const { profile, isAdmin } = useSpacePlace();
  const [view, setView] = useState<TodayView>("my");
  const [tasks, setTasks] = useState<CrmTaskWithRelations[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [organisations, setOrganisations] = useState<CrmOrganisation[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);

  const roster = useMemo(() => dedupeActiveSpacers(spacers), [spacers]);

  const showOwnerOnCards = useMemo(() => {
    if (!isAdmin) return false;
    if (view === "my") return false;
    return true;
  }, [isAdmin, view]);

  const viewingLabel = useMemo(() => {
    const count = tasks.length;
    if (view === "my") return `My activities (${count})`;
    if (view === "all") return `All activities (${count})`;
    const spacer = roster.find((p) => p.id === view.profileId);
    const name = spacer
      ? formatSpacerOptionLabel(spacer, roster)
      : profiles[view.profileId] || "Spacer";
    return `${name} (${count})`;
  }, [view, tasks.length, roster, profiles]);

  const load = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    setLoading(true);

    let q = crmDb
      .tasks()
      .select(TASK_SELECT)
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false });

    if (!isAdmin || view === "my") {
      q = q.eq("owner_id", profile.id);
    } else if (view !== "all") {
      q = q.eq("owner_id", view.profileId);
    }

    const [
      { data },
      { data: profs },
      { data: activeProfiles },
      { data: orgs },
      { data: allContacts },
    ] = await Promise.all([
      q,
      crmDb.profiles().select("id, full_name"),
      crmDb.profiles().select("*").eq("active", true),
      crmDb.organisations().select("*").order("name"),
      crmDb.contacts().select("*").order("full_name"),
    ]);
    const nameMap: Record<string, string> = {};
    for (const p of profs || []) {
      if (p.id) nameMap[p.id] = p.full_name || "Spacer";
    }
    setProfiles(nameMap);
    setSpacers((activeProfiles as CrmProfile[]) || []);
    setOrganisations((orgs as CrmOrganisation[]) || []);
    setContacts((allContacts as CrmContact[]) || []);
    const enriched = ((data as CrmTaskWithRelations[]) || []).map((t) => ({
      ...t,
      owner_profile: t.owner_id
        ? { id: t.owner_id, full_name: nameMap[t.owner_id] || null }
        : null,
    }));
    setTasks(enriched);
    setLoading(false);
  }, [isAdmin, profile, view]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTaskReassigned = useCallback(
    ({ taskId, ownerId, ownerName }: TaskReassignResult) => {
      setTasks((prev) => {
        const removeFromList =
          (view === "my" && ownerId !== profile?.id) ||
          (view !== "my" &&
            view !== "all" &&
            ownerId !== view.profileId);

        if (removeFromList) {
          return prev.filter((t) => t.id !== taskId);
        }

        return prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                owner_id: ownerId,
                owner_profile: { id: ownerId, full_name: ownerName },
              }
            : t
        );
      });
      setProfiles((prev) => ({ ...prev, [ownerId]: ownerName }));
    },
    [view, profile?.id]
  );

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

  const taskList = (list: CrmTaskWithRelations[]) =>
    list.map((t) => (
      <TaskCard
        key={t.id}
        task={t}
        onUpdated={load}
        onReassigned={handleTaskReassigned}
        assignees={roster}
        profileId={profile?.id}
        organisations={organisations}
        contacts={contacts}
        showOwner={showOwnerOnCards}
      />
    ));

  return (
    <div>
      <PageTitle
        title={`Good day, ${greeting}`}
        subtitle={format(new Date(), "EEEE, d MMMM")}
      />

      {isAdmin ? (
        <div className="mb-4">
          <label className="block">
            <span className={LABEL_CLASS}>Viewing</span>
            <select
              value={viewSelectValue(view)}
              onChange={(e) => setView(viewFromSelectValue(e.target.value))}
              className={FIELD_CLASS}
            >
              <option value="my">My activities</option>
              <option value="all">All activities</option>
              {roster.map((spacer) => (
                <option key={spacer.id} value={spacer.id}>
                  {formatSpacerOptionLabel(spacer, roster)}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-sm text-neutral-600">{viewingLabel}</p>
        </div>
      ) : null}

      {loading ? (
        <p className="text-neutral-600">Loading tasks…</p>
      ) : (
        <>
          <SectionHeading>Overdue</SectionHeading>
          {grouped.overdue.length === 0 ? (
            <p className="mb-4 text-neutral-500">Nothing overdue.</p>
          ) : (
            taskList(grouped.overdue)
          )}

          <SectionHeading>Due today</SectionHeading>
          {grouped.today.length === 0 ? (
            <p className="mb-4 text-neutral-500">Nothing due today.</p>
          ) : (
            taskList(grouped.today)
          )}

          <SectionHeading>Upcoming</SectionHeading>
          {grouped.upcoming.length === 0 ? (
            <p className="text-neutral-500">No upcoming tasks.</p>
          ) : (
            taskList(grouped.upcoming)
          )}
        </>
      )}
    </div>
  );
}
