"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { displayName, formatDateTime } from "@/lib/space-place/format";
import type {
  CrmContact,
  CrmOrganisation,
  CrmEngagement,
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
import { ContactActionBar } from "../../components/ContactActionBar";
import { ContactEmailActions } from "../../components/ContactEmailActions";
import { EditContactPanel } from "../../components/EditContactPanel";
import { TaskCard } from "../../components/TaskCard";
import { CrmEmailList } from "../../components/CrmEmailList";
import type { CrmEmailMessageWithRelations } from "@/lib/space-place/types";
import { dedupeActiveSpacers } from "@/lib/space-place/spacers";
import { CrmMarketplaceListingsSection } from "../../components/CrmMarketplaceListingsSection";

export default function ContactDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { isAdmin, canViewAllOrganisations, profile } = useSpacePlace();

  const [contact, setContact] = useState<CrmContact | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [org, setOrg] = useState<CrmOrganisation | null>(null);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [emails, setEmails] = useState<CrmEmailMessageWithRelations[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);

  const load = useCallback(async () => {
    const { data: c } = await crmDb.contacts()
      .select("*")
      .eq("id", id)
      .single();
    const row = c as CrmContact | null;
    setContact(row);
    if (!row) return;
    const [o, e, em, t, p] = await Promise.all([
      crmDb.organisations()
        .select("*")
        .eq("id", row.organisation_id)
        .single(),
      crmDb.engagements()
        .select("*")
        .eq("contact_id", id)
        .order("occurred_at", { ascending: false }),
      crmDb
        .emailMessages()
        .select(
          `*,
          crm_contacts ( id, full_name, email ),
          crm_organisations ( id, name )`
        )
        .eq("contact_id", id)
        .order("sent_at", { ascending: false })
        .limit(50),
      crmDb.tasks()
        .select("*")
        .eq("contact_id", id)
        .order("due_date"),
      crmDb.profiles().select("*").eq("active", true).order("full_name"),
    ]);
    setOrg((o.data as CrmOrganisation) || null);
    setEngagements((e.data as CrmEngagement[]) || []);
    setEmails((em.data as CrmEmailMessageWithRelations[]) || []);
    setTasks((t.data as CrmTask[]) || []);
    setSpacers((p.data as CrmProfile[]) || []);
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
  const roster = dedupeActiveSpacers(spacers);

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
        canViewAllOrganisations={canViewAllOrganisations}
        userId={profile?.id || ""}
      />

      <Card className="mb-4">
        {contact.role ? (
          <p className="text-neutral-600">{contact.role}</p>
        ) : null}
        <p className="mt-2">{contact.phone || "No phone"}</p>
        {contact.email ? (
          <div className="mt-1">
            <p className="text-neutral-800">{contact.email}</p>
            <ContactEmailActions
              email={contact.email}
              contactId={contact.id}
              className="mt-2"
            />
          </div>
        ) : (
          <p className="mt-1">No email</p>
        )}
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
          <ContactActionBar phone={contact.phone} whatsapp={contact.whatsapp} />
        </div>
      </Card>

      <SectionHeading>Emails</SectionHeading>
      <CrmEmailList emails={emails} />

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

      {org ? (
        <CrmMarketplaceListingsSection
          mode="contact"
          entityId={contact.id}
          organisationId={org.id}
          organisationName={org.name}
        />
      ) : null}

      <SectionHeading>Tasks</SectionHeading>
      {tasks.map((t) => (
        <TaskCard
          key={t.id}
          task={{
            ...t,
            crm_organisations: org
              ? {
                  id: org.id,
                  name: org.name,
                  pipeline_stage: org.pipeline_stage,
                }
              : null,
            crm_contacts: {
              id: contact.id,
              full_name: contact.full_name,
              phone: contact.phone,
              whatsapp: contact.whatsapp,
              email: contact.email,
            },
            owner_profile: t.owner_id
              ? {
                  id: t.owner_id,
                  full_name:
                    spacers.find((s) => s.id === t.owner_id)?.full_name || null,
                }
              : null,
          }}
          onUpdated={load}
          assignees={roster}
          profileId={profile?.id}
          organisations={org ? [org] : []}
          contacts={[contact]}
        />
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
