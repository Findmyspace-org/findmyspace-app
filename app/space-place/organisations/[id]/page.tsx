"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/space-place/constants";
import type {
  CrmOrganisation,
  CrmContact,
  CrmTask,
  CrmEngagement,
  CrmProfile,
} from "@/lib/space-place/types";
import { useSpacePlace } from "../../SpacePlaceContext";
import {
  Card,
  PageTitle,
  PrimaryButton,
  SectionHeading,
} from "../../components/SpacePlaceShell";
import { formatDateTime } from "@/lib/space-place/format";

export default function OrganisationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { isAdmin } = useSpacePlace();

  const [org, setOrg] = useState<CrmOrganisation | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [notes, setNotes] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [o, c, t, e, p] = await Promise.all([
      crmDb.organisations().select("*").eq("id", id).single(),
      crmDb.contacts().select("*").eq("organisation_id", id),
      crmDb.tasks()
        .select("*")
        .eq("organisation_id", id)
        .order("due_date"),
      crmDb.engagements()
        .select("*")
        .eq("organisation_id", id)
        .order("occurred_at", { ascending: false })
        .limit(20),
      isAdmin
        ? crmDb.profiles().select("*").eq("active", true)
        : Promise.resolve({ data: [] }),
    ]);
    const row = o.data as CrmOrganisation | null;
    setOrg(row);
    setNotes(row?.notes || "");
    setLostReason(row?.lost_reason || "");
    setContacts((c.data as CrmContact[]) || []);
    setTasks((t.data as CrmTask[]) || []);
    setEngagements((e.data as CrmEngagement[]) || []);
    setSpacers((p.data as CrmProfile[]) || []);
  }, [id, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateField(
    patch: Partial<CrmOrganisation> & { pipeline_stage?: PipelineStage }
  ) {
    if (!org) return;
    setSaving(true);
    setMessage(null);
    const { error } = await crmDb.organisations()
      .update(patch)
      .eq("id", org.id);
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

  if (!org) {
    return <p className="text-neutral-600">Loading…</p>;
  }

  const assignedName =
    spacers.find((s) => s.id === org.assigned_to)?.full_name || "Unassigned";

  return (
    <div>
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-3 text-sm font-semibold text-[#c1121f]"
      >
        ← Back
      </button>
      <PageTitle title={org.name} subtitle={org.type || "Organisation"} />

      <Card className="mb-4">
        <p className="text-sm text-neutral-600">Assigned Spacer</p>
        {isAdmin ? (
          <select
            value={org.assigned_to || ""}
            onChange={(e) =>
              updateField({
                assigned_to: e.target.value || null,
              } as Partial<CrmOrganisation>)
            }
            className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
          >
            <option value="">Unassigned</option>
            {spacers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
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

      <SectionHeading>Contacts</SectionHeading>
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

      <SectionHeading>Recent engagements</SectionHeading>
      {engagements.map((e) => (
        <Card key={e.id} className="mb-2">
          <p className="text-xs text-neutral-500">
            {formatDateTime(e.occurred_at)} · {e.type}
          </p>
          <p>{e.summary}</p>
        </Card>
      ))}
    </div>
  );
}
