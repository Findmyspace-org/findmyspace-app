"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { crmDb } from "@/lib/space-place/db";
import { PIPELINE_STAGE_LABELS } from "@/lib/space-place/constants";
import { displayName, formatActivityDate } from "@/lib/space-place/format";
import type {
  CrmContact,
  CrmEngagement,
  CrmOrganisation,
  CrmTask,
} from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card, PageTitle } from "../components/SpacePlaceShell";
import { ContactActionBar } from "../components/ContactActionBar";
import { CreateOrganisationPanel } from "../components/CreateOrganisationPanel";
import type { CrmProfile } from "@/lib/space-place/types";

type SpaceRow = CrmOrganisation & {
  assigned_name: string | null;
  main_contact: CrmContact | null;
  last_activity: string | null;
  next_task_due: string | null;
  next_task_title: string | null;
};

export default function SpacesPage() {
  const { isAdmin, profile } = useSpacePlace();
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let oq = crmDb.organisations().select("*").order("name");
    if (!isAdmin && profile) {
      oq = oq.eq("assigned_to", profile.id);
    }

    const [oRes, cRes, eRes, tRes, pRes, spacerRes] = await Promise.all([
      oq,
      crmDb.contacts().select("*"),
      crmDb.engagements()
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
      crmDb.tasks()
        .select("*")
        .eq("status", "open")
        .order("due_date", { ascending: true }),
      crmDb.profiles().select("id, full_name"),
      isAdmin
        ? crmDb.profiles().select("*").eq("active", true).order("full_name")
        : Promise.resolve({ data: [] as CrmProfile[] }),
    ]);

    setSpacers((spacerRes.data as CrmProfile[]) || []);

    const contacts = (cRes.data as CrmContact[]) || [];
    const engagements = (eRes.data as CrmEngagement[]) || [];
    const tasks = (tRes.data as CrmTask[]) || [];
    const profileMap = Object.fromEntries(
      ((pRes.data as { id: string; full_name: string | null }[]) || []).map(
        (p) => [p.id, p.full_name]
      )
    );

    const rows: SpaceRow[] = ((oRes.data as CrmOrganisation[]) || []).map(
      (org) => {
        const orgContacts = contacts.filter(
          (c) => c.organisation_id === org.id
        );
        const mainContact = orgContacts[0] ?? null;
        const lastEng = engagements.find((e) => e.organisation_id === org.id);
        const nextTask = tasks.find((t) => t.organisation_id === org.id);

        return {
          ...org,
          assigned_name: org.assigned_to
            ? profileMap[org.assigned_to] ?? null
            : null,
          main_contact: mainContact,
          last_activity: lastEng
            ? formatActivityDate(lastEng.occurred_at)
            : null,
          next_task_due: nextTask?.due_date ?? null,
          next_task_title: nextTask?.title ?? null,
        };
      }
    );

    setSpaces(rows);
    setLoading(false);
  }, [isAdmin, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return spaces;

    return spaces.filter((space) => {
      const stageLabel =
        PIPELINE_STAGE_LABELS[space.pipeline_stage].toLowerCase();
      const contact = space.main_contact;
      const contactName = contact
        ? displayName(contact.full_name, contact.first_name, contact.last_name)
        : "";
      const haystack = [
        space.name,
        space.type,
        stageLabel,
        space.assigned_name,
        contactName,
        contact?.phone,
        contact?.email,
        contact?.whatsapp,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [spaces, search]);

  return (
    <div>
      <PageTitle title="Spaces" subtitle="All spaces and prospects" />

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="mb-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#c1121f] bg-[#c1121f] px-4 text-lg font-semibold text-white shadow-sm active:bg-[#a10f1a]"
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
        New organisation
      </button>

      {profile ? (
        <CreateOrganisationPanel
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => void load()}
          isAdmin={isAdmin}
          userId={profile.id}
          spacers={spacers}
        />
      ) : null}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, contact, phone, email, type, stage…"
        className="mb-4 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
      />

      {loading ? (
        <p className="text-neutral-600">Loading spaces…</p>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-500">No spaces found.</p>
      ) : (
        filtered.map((space) => {
          const contact = space.main_contact;
          const contactLabel = contact
            ? displayName(
                contact.full_name,
                contact.first_name,
                contact.last_name
              )
            : null;

          return (
            <Card key={space.id} className="mb-3">
              <p className="text-lg font-semibold">{space.name}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-sm text-neutral-600">
                {space.type ? (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 capitalize">
                    {space.type}
                  </span>
                ) : null}
                <span className="rounded-full bg-[#c1121f]/10 px-2.5 py-0.5 font-medium text-[#c1121f]">
                  {PIPELINE_STAGE_LABELS[space.pipeline_stage]}
                </span>
              </div>

              <p className="mt-2 text-sm text-neutral-600">
                Spacer: {space.assigned_name || "Unassigned"}
              </p>
              {contactLabel ? (
                <p className="text-sm text-neutral-600">{contactLabel}</p>
              ) : null}
              {contact?.phone || contact?.email ? (
                <p className="mt-1 text-sm text-neutral-500">
                  {[contact.phone, contact.email].filter(Boolean).join(" · ")}
                </p>
              ) : null}

              <p className="mt-2 text-xs text-neutral-500">
                Last activity: {space.last_activity || "—"}
              </p>
              <p className="text-xs text-neutral-500">
                Next task:{" "}
                {space.next_task_due
                  ? `${space.next_task_title || "Task"} · ${space.next_task_due}`
                  : "—"}
              </p>

              <div className="mt-3">
                <Link
                  href={`/space-place/organisations/${space.id}`}
                  className="mb-2 block text-center text-sm font-semibold text-[#c1121f]"
                >
                  Open
                </Link>
                <ContactActionBar
                  phone={contact?.phone}
                  whatsapp={contact?.whatsapp}
                  email={contact?.email}
                />
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
