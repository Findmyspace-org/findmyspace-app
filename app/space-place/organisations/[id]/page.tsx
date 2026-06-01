"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { crmDb } from "@/lib/space-place/db";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/space-place/constants";
import { dedupeActiveSpacers } from "@/lib/space-place/spacers";
import type {
  CrmOrganisation,
  CrmContact,
  CrmTask,
  CrmProfile,
} from "@/lib/space-place/types";
import { useSpacePlace } from "../../SpacePlaceContext";
import {
  Card,
  PageTitle,
  PrimaryButton,
  SectionHeading,
} from "../../components/SpacePlaceShell";
import { SpacerSelect } from "../../components/SpacerSelect";
import {
  SpaceActivityHistory,
  type SpaceEngagementRow,
} from "../../components/SpaceActivityHistory";
import { EditOrganisationPanel } from "../../components/EditOrganisationPanel";
import { CreateContactPanel } from "../../components/CreateContactPanel";

export default function OrganisationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { isAdmin, profile } = useSpacePlace();

  const [org, setOrg] = useState<CrmOrganisation | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [engagements, setEngagements] = useState<SpaceEngagementRow[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createContactOpen, setCreateContactOpen] = useState(false);

  const load = useCallback(async () => {
    setActivityLoading(true);
    const [o, c, t, e, p] = await Promise.all([
      crmDb.organisations().select("*").eq("id", id).single(),
      crmDb.contacts().select("*").eq("organisation_id", id),
      crmDb.tasks().select("*").eq("organisation_id", id).order("due_date"),
      crmDb
        .engagements()
        .select(
          `*,
          crm_contacts ( id, full_name, first_name, last_name )`
        )
        .eq("organisation_id", id)
        .order("occurred_at", { ascending: false }),
      isAdmin
        ? crmDb.profiles().select("*").eq("active", true).order("full_name")
        : Promise.resolve({ data: [] }),
    ]);

    const row = o.data as CrmOrganisation | null;
    setOrg(row);
    setNotes(row?.notes || "");
    setLostReason(row?.lost_reason || "");
    setContacts((c.data as CrmContact[]) || []);
    setTasks((t.data as CrmTask[]) || []);
    setSpacers((p.data as CrmProfile[]) || []);

    const { data: profs } = await crmDb.profiles().select("id, full_name");
    const creatorMap = Object.fromEntries(
      ((profs as { id: string; full_name: string | null }[]) || []).map(
        (profile) => [profile.id, profile.full_name]
      )
    );

    const engagementRows = ((e.data as SpaceEngagementRow[]) || []).map(
      (eng) => ({
        ...eng,
        contact: eng.crm_contacts ?? null,
        creator: eng.created_by
          ? {
              id: eng.created_by,
              full_name: creatorMap[eng.created_by] ?? null,
            }
          : null,
      })
    );
    setEngagements(engagementRows);
    setActivityLoading(false);
  }, [id, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const roster = useMemo(() => dedupeActiveSpacers(spacers), [spacers]);

  const assignedName =
    roster.find((s) => s.id === org?.assigned_to)?.full_name || "Unassigned";

  async function updateField(
    patch: Partial<CrmOrganisation> & { pipeline_stage?: PipelineStage }
  ) {
    if (!org) return;
    setSaving(true);
    setMessage(null);
    const { error } = await crmDb.organisations().update(patch).eq("id", org.id);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  }

  async function saveNotes() {
    await updateField({ notes });
  }

  function handleOrganisationSaved(updated: CrmOrganisation) {
    setOrg(updated);
    setNotes(updated.notes || "");
    setLostReason(updated.lost_reason || "");
  }

  function handleContactCreated(created: CrmContact) {
    setContacts((prev) => {
      if (prev.some((c) => c.id === created.id)) return prev;
      return [...prev, created];
    });
  }

  if (!org) {
    return <p className="text-neutral-600">Loading…</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-3 text-sm font-semibold text-[#c1121f]"
      >
        ← Back
      </button>
      <div className="mb-5 flex items-start justify-between gap-3">
        <PageTitle
          title={org.name}
          subtitle={org.type || "Organisation"}
          className="mb-0 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm active:bg-neutral-50"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </button>
      </div>

      <EditOrganisationPanel
        organisation={org}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={handleOrganisationSaved}
        isAdmin={isAdmin}
        spacers={spacers}
      />

      <Card className="mb-4">
        <p className="text-sm text-neutral-600">Assigned Spacer</p>
        {isAdmin ? (
          <SpacerSelect
            value={org.assigned_to || ""}
            onChange={(value) =>
              updateField({
                assigned_to: value || null,
              } as Partial<CrmOrganisation>)
            }
            spacers={spacers}
          />
        ) : (
          <p className="mt-1 text-lg font-medium">{assignedName}</p>
        )}

        <p className="mt-4 text-sm text-neutral-600">Pipeline stage</p>
        <select
          value={org.pipeline_stage}
          onChange={(e) => {
            const stage = e.target.value as PipelineStage;
            if (stage === "closed_lost" && !lostReason.trim()) {
              setMessage("Please enter a reason before closing.");
              return;
            }
            updateField({
              pipeline_stage: stage,
              ...(stage === "closed_lost"
                ? { lost_reason: lostReason.trim() }
                : {}),
            });
          }}
          className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {PIPELINE_STAGE_LABELS[s]}
            </option>
          ))}
        </select>

        <div className="mt-3">
          <label className="text-sm font-semibold">
            Reason (required for Closed / Not Now)
          </label>
          <input
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
          />
        </div>

        {org.website ? (
          <p className="mt-3 text-sm">
            <a href={org.website} className="text-[#c1121f] underline">
              {org.website}
            </a>
          </p>
        ) : null}
        {org.address ? (
          <p className="mt-1 text-sm text-neutral-600">{org.address}</p>
        ) : null}
        {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
      </Card>

      <label className="block">
        <span className="text-sm font-semibold">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
        />
      </label>
      <PrimaryButton onClick={saveNotes} disabled={saving} className="mt-2 mb-6">
        Save notes
      </PrimaryButton>

      <SectionHeading>Space Activity History</SectionHeading>
      <p className="mb-4 text-sm text-neutral-600">
        All interactions for this space — every contact included.
      </p>
      <SpaceActivityHistory
        engagements={engagements}
        tasks={tasks}
        loading={activityLoading}
      />

      <SectionHeading>Contacts</SectionHeading>
      <button
        type="button"
        onClick={() => setCreateContactOpen(true)}
        className="mb-3 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[#c1121f] bg-white px-4 text-sm font-semibold text-[#c1121f] active:bg-[#c1121f]/5"
      >
        Add contact
      </button>

      {profile ? (
        <CreateContactPanel
          open={createContactOpen}
          onClose={() => setCreateContactOpen(false)}
          onCreated={handleContactCreated}
          isAdmin={isAdmin}
          userId={profile.id}
          defaultOrganisationId={org.id}
        />
      ) : null}

      {contacts.map((c) => (
        <Link key={c.id} href={`/space-place/contacts/${c.id}`}>
          <Card className="mb-2">{c.full_name || c.first_name}</Card>
        </Link>
      ))}

      <SectionHeading>Tasks</SectionHeading>
      {tasks.map((t) => (
        <Card key={t.id} className="mb-2">
          <p className="font-semibold">{t.title}</p>
          <p className="text-sm text-neutral-500">
            {t.due_date} · {t.status}
          </p>
        </Card>
      ))}
      {isAdmin ? (
        <Link
          href={`/space-place/tasks/new?organisation=${org.id}`}
          className="mb-6 block text-center font-semibold text-[#c1121f]"
        >
          + Assign task
        </Link>
      ) : null}
    </div>
  );
}
