"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { displayName, formatDateTime } from "@/lib/space-place/format";
import type { CrmContact, CrmOrganisation, CrmEngagement, CrmTask } from "@/lib/space-place/types";
import { useSpacePlace } from "../../SpacePlaceContext";
import {
  Card,
  PageTitle,
  PrimaryButton,
  SectionHeading,
} from "../../components/SpacePlaceShell";
import { ContactActionBar } from "../../components/ContactActionBar";
import { EditContactPanel } from "../../components/EditContactPanel";

export default function ContactDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { isAdmin, profile } = useSpacePlace();

  const [contact, setContact] = useState<CrmContact | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [org, setOrg] = useState<CrmOrganisation | null>(null);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);

  const load = useCallback(async () => {
    const { data: c } = await crmDb.contacts()
      .select("*")
      .eq("id", id)
      .single();
    const row = c as CrmContact | null;
    setContact(row);
    if (!row) return;
    const [o, e, t] = await Promise.all([
      crmDb.organisations()
        .select("*")
        .eq("id", row.organisation_id)
        .single(),
      crmDb.engagements()
        .select("*")
        .eq("contact_id", id)
        .order("occurred_at", { ascending: false }),
      crmDb.tasks()
        .select("*")
        .eq("contact_id", id)
        .order("due_date"),
    ]);
    setOrg((o.data as CrmOrganisation) || null);
    setEngagements((e.data as CrmEngagement[]) || []);
    setTasks((t.data as CrmTask[]) || []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!contact) {
    return <p className="text-neutral-600">Loading…</p>;
  }

  const name = displayName(
    contact.full_name,
    contact.first_name,
    contact.last_name
  );

  function handleContactSaved(
    updated: CrmContact,
    updatedOrg: CrmOrganisation | null
  ) {
    setContact(updated);
    if (updatedOrg) setOrg(updatedOrg);
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
        <PageTitle title={name} subtitle={org?.name} className="mb-0 min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm active:bg-neutral-50"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </button>
      </div>

      <EditContactPanel
        contact={contact}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={handleContactSaved}
        isAdmin={isAdmin}
        userId={profile?.id || ""}
      />

      <Card className="mb-4">
        {contact.role ? (
          <p className="text-neutral-600">{contact.role}</p>
        ) : null}
        <p className="mt-2">{contact.phone || "No phone"}</p>
        <p>{contact.email || "No email"}</p>
        {contact.status ? (
          <span className="mt-2 inline-block rounded-full bg-neutral-100 px-3 py-1 text-sm capitalize">
            {contact.status}
          </span>
        ) : null}
        {contact.notes ? (
          <p className="mt-3 text-sm text-neutral-600 whitespace-pre-wrap">
            {contact.notes}
          </p>
        ) : null}
        {contact.whatsapp ? (
          <p className="mt-1 text-sm text-neutral-600">
            WhatsApp: {contact.whatsapp}
          </p>
        ) : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link href={`/space-place/add?type=note&contact=${contact.id}&org=${contact.organisation_id}`}>
            <PrimaryButton>Log Note</PrimaryButton>
          </Link>
          <Link href={`/space-place/tasks/new?contact=${contact.id}&organisation=${contact.organisation_id}`}>
            <PrimaryButton className="!bg-neutral-900">Add Task</PrimaryButton>
          </Link>
        </div>
        <div className="mt-3">
          <ContactActionBar
            phone={contact.phone}
            whatsapp={contact.whatsapp}
            email={contact.email}
          />
        </div>
      </Card>

      <SectionHeading>Activity with this contact</SectionHeading>
      {engagements.length === 0 ? (
        <p className="text-neutral-500">No activity yet.</p>
      ) : (
        engagements.map((e) => (
          <Card key={e.id} className="mb-2">
            <p className="text-xs text-neutral-500">
              {formatDateTime(e.occurred_at)} · {e.type}
            </p>
            <p>{e.summary}</p>
          </Card>
        ))
      )}

      <SectionHeading>Tasks</SectionHeading>
      {tasks.map((t) => (
        <Card key={t.id} className="mb-2">
          <p className="font-semibold">{t.title}</p>
          <p className="text-sm text-neutral-500">{t.due_date}</p>
        </Card>
      ))}

      {org ? (
        <Link
          href={`/space-place/organisations/${org.id}`}
          className="mt-4 block text-center font-semibold text-[#c1121f]"
        >
          View organisation
        </Link>
      ) : null}
    </div>
  );
}
