"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { dueBucket } from "@/lib/space-place/format";
import type {
  CrmTaskWithRelations,
  CrmProfile,
  CrmOrganisation,
  CrmContact,
} from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { PageTitle } from "../components/SpacePlaceShell";
import { TaskCard } from "../components/TaskCard";
import {
  dedupeActiveSpacers,
  formatSpacerOptionLabel,
} from "@/lib/space-place/spacers";

const FILTERS = ["all", "spacer", "overdue", "today", "upcoming", "done"] as const;
type Filter = (typeof FILTERS)[number];

function TasksPageContent() {
  const { isAdmin, profile } = useSpacePlace();
  const router = useRouter();
  const params = useSearchParams();
  const filter = (params.get("filter") as Filter) || "all";
  const spacerId = isAdmin ? params.get("spacer") || "" : profile?.id || "";

  const [tasks, setTasks] = useState<CrmTaskWithRelations[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [organisations, setOrganisations] = useState<CrmOrganisation[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);

  const load = useCallback(async () => {
    let q = crmDb
      .tasks()
      .select(
        `*,
        crm_organisations ( id, name, pipeline_stage ),
        crm_contacts ( id, full_name, phone, whatsapp, email ),
        owner_profile:crm_profiles ( id, full_name, email, active, role )`
      )
      .order("due_date", { ascending: true });
    const [{ data }, { data: profs }, { data: orgs }, { data: allContacts }] =
      await Promise.all([
        q,
        crmDb.profiles().select("*").eq("active", true),
        crmDb.organisations().select("*").order("name"),
        crmDb.contacts().select("*").order("full_name"),
      ]);
    setTasks((data as CrmTaskWithRelations[]) || []);
    setSpacers((profs as CrmProfile[]) || []);
    setOrganisations((orgs as CrmOrganisation[]) || []);
    setContacts((allContacts as CrmContact[]) || []);
  }, [isAdmin, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (spacerId && t.owner_id !== spacerId) return false;
      const bucket = dueBucket(t.due_date, t.status);
      if (filter === "done") return t.status === "done";
      if (filter === "overdue") return bucket === "overdue";
      if (filter === "today") return bucket === "today";
      if (filter === "upcoming") return bucket === "upcoming";
      if (filter === "all" || filter === "spacer") return t.status === "open";
      return true;
    });
  }, [tasks, filter, spacerId]);

  const roster = dedupeActiveSpacers(spacers);
  const spacerFilters = FILTERS.filter((f) => f !== "spacer");

  return (
    <div>
      <PageTitle
        title="Tasks"
        subtitle={isAdmin ? "Assign and track follow-ups" : "Your follow-ups"}
      />
      <Link
        href="/space-place/tasks/new"
        className="mb-4 block rounded-xl bg-[#c1121f] py-3 text-center font-semibold text-white"
      >
        + New task
      </Link>

      <div className="mb-4 flex flex-wrap gap-2">
        {(isAdmin ? FILTERS : spacerFilters).map((f) => (
          <Link
            key={f}
            href={`/space-place/tasks?filter=${f}${isAdmin && spacerId ? `&spacer=${spacerId}` : ""}`}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${
              filter === f
                ? "bg-[#c1121f] text-white"
                : "bg-white border border-neutral-200"
            }`}
          >
            {f === "spacer" ? "By Spacer" : f}
          </Link>
        ))}
      </div>

      {isAdmin && (filter === "spacer" || spacerId) ? (
        <select
          value={spacerId}
          onChange={(e) =>
            router.push(
              `/space-place/tasks?filter=spacer&spacer=${e.target.value}`
            )
          }
          className="mb-4 w-full rounded-xl border border-neutral-200 p-3"
        >
          <option value="">All Spacers</option>
          {roster.map((s) => (
            <option key={s.id} value={s.id}>
              {formatSpacerOptionLabel(s, roster)}
            </option>
          ))}
        </select>
      ) : null}

      {filtered.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          onUpdated={load}
          assignees={roster}
          profileId={profile?.id}
          organisations={organisations}
          contacts={contacts}
        />
      ))}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <TasksPageContent />
    </Suspense>
  );
}
