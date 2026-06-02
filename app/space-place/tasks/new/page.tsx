"use client";
import { crmDb } from "@/lib/space-place/db";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { CrmContact, CrmOrganisation, CrmProfile } from "@/lib/space-place/types";
import { useSpacePlace } from "../../SpacePlaceContext";
import { PageTitle, PrimaryButton } from "../../components/SpacePlaceShell";
import { SpacerSelect } from "../../components/SpacerSelect";

function NewTaskContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { isAdmin, profile } = useSpacePlace();

  const [orgs, setOrgs] = useState<CrmOrganisation[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [title, setTitle] = useState("");
  const [organisationId, setOrganisationId] = useState(
    params.get("organisation") || ""
  );
  const [contactId, setContactId] = useState(params.get("contact") || "");
  const [ownerId, setOwnerId] = useState(profile?.id || "");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [o, s] = await Promise.all([
      crmDb.organisations().select("*").order("name"),
      crmDb.profiles().select("*").eq("active", true),
    ]);
    setOrgs((o.data as CrmOrganisation[]) || []);
    setSpacers((s.data as CrmProfile[]) || []);
  }, []);

  useEffect(() => {
    if (!isAdmin && profile) {
      setOwnerId(profile.id);
    }
    load();
  }, [isAdmin, profile, load]);

  useEffect(() => {
    if (!organisationId) {
      setContacts([]);
      return;
    }
    void crmDb
      .contacts()
      .select("*")
      .eq("organisation_id", organisationId)
      .then(({ data }: { data: CrmContact[] | null }) =>
        setContacts(data || [])
      );
  }, [organisationId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !ownerId) {
      setMessage("Title and assignee are required.");
      return;
    }
    setSaving(true);
    const { error } = await crmDb.tasks().insert({
      title: title.trim(),
      organisation_id: organisationId || null,
      contact_id: contactId || null,
      owner_id: ownerId,
      due_date: dueDate || null,
      priority,
      status: "open",
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.push("/space-place/today");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <PageTitle title="New task" />
      <label className="block">
        <span className="text-sm font-semibold">Title</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
          placeholder="Follow up with Ilona"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Organisation</span>
        <select
          value={organisationId}
          onChange={(e) => {
            setOrganisationId(e.target.value);
            setContactId("");
          }}
          className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
        >
          <option value="">Optional</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Contact</span>
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
        >
          <option value="">Optional</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Assigned to</span>
        <SpacerSelect
          includeUnassigned={false}
          value={ownerId}
          onChange={setOwnerId}
          spacers={spacers}
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Due date</span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Priority</span>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </label>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
      <PrimaryButton type="submit" disabled={saving}>
        {saving ? "Saving…" : "Create task"}
      </PrimaryButton>
    </form>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NewTaskContent />
    </Suspense>
  );
}
