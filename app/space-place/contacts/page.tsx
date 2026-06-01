"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { displayName, formatActivityDate } from "@/lib/space-place/format";
import type { CrmContact, CrmEngagement, CrmOrganisation, CrmTask } from "@/lib/space-place/types";
import { Card, PageTitle } from "../components/SpacePlaceShell";
import { ContactActionBar } from "../components/ContactActionBar";

type ContactRow = CrmContact & {
  organisation?: Pick<CrmOrganisation, "id" | "name"> | null;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, eRes, tRes] = await Promise.all([
      crmDb.contacts()
        .select("*, organisation:crm_organisations(id, name)")
        .order("full_name"),
      crmDb.engagements()
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(300),
      crmDb.tasks()
        .select("*")
        .eq("status", "open")
        .order("due_date", { ascending: true }),
    ]);
    setContacts((cRes.data as ContactRow[]) || []);
    setEngagements((eRes.data as CrmEngagement[]) || []);
    setTasks((tRes.data as CrmTask[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const name = displayName(c.full_name, c.first_name, c.last_name).toLowerCase();
      const org = c.organisation?.name?.toLowerCase() || "";
      return (
        name.includes(q) ||
        org.includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q)
      );
    });
  }, [contacts, search]);

  function lastActivity(contactId: string) {
    const e = engagements.find((x) => x.contact_id === contactId);
    return e ? formatActivityDate(e.occurred_at) : "—";
  }

  function nextAction(contactId: string) {
    const t = tasks.find((x) => x.contact_id === contactId);
    return t?.title || "—";
  }

  return (
    <div>
      <PageTitle title="Contacts" subtitle="People at your spaces" />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search contacts…"
        className="mb-4 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
      />
      {loading ? (
        <p className="text-neutral-600">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-500">No contacts found.</p>
      ) : (
        filtered.map((c) => (
          <Card key={c.id} className="mb-3">
            <Link href={`/space-place/contacts/${c.id}`}>
              <p className="text-lg font-semibold">
                {displayName(c.full_name, c.first_name, c.last_name)}
              </p>
            </Link>
            <p className="text-sm text-neutral-600">{c.organisation?.name}</p>
            {c.role ? <p className="text-sm text-neutral-500">{c.role}</p> : null}
            <p className="mt-2 text-sm">
              {c.phone || "—"} · {c.email || "—"}
            </p>
            {c.status ? (
              <span className="mt-2 inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium capitalize">
                {c.status}
              </span>
            ) : null}
            <p className="mt-2 text-xs text-neutral-500">
              Last: {lastActivity(c.id)} · Next: {nextAction(c.id)}
            </p>
            <div className="mt-3">
              <ContactActionBar
                phone={c.phone}
                whatsapp={c.whatsapp}
                email={c.email}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
