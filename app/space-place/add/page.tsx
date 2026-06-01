"use client";
import { crmDb } from "@/lib/space-place/db";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ENGAGEMENT_TYPES } from "@/lib/space-place/constants";
import type { CrmContact, CrmOrganisation } from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { PageTitle, PrimaryButton } from "../components/SpacePlaceShell";

const QUICK_TYPES = [
  { type: "call", label: "Log Call", href: "?type=call" },
  { type: "whatsapp", label: "Log WhatsApp", href: "?type=whatsapp" },
  { type: "email", label: "Log Email", href: "?type=email" },
  { type: "meeting", label: "Log Meeting", href: "?type=meeting" },
  { type: "note", label: "Log Note", href: "?type=note" },
] as const;

function AddPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const presetType = params.get("type");
  const { profile } = useSpacePlace();

  const [orgs, setOrgs] = useState<CrmOrganisation[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [organisationId, setOrganisationId] = useState("");
  const [contactId, setContactId] = useState("");
  const [type, setType] = useState(presetType || "note");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    const { data } = await crmDb.organisations()
      .select("*")
      .order("name");
    setOrgs((data as CrmOrganisation[]) || []);
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    const org = params.get("org") || params.get("organisation");
    const contact = params.get("contact");
    if (org) setOrganisationId(org);
    if (contact) setContactId(contact);
  }, [params]);

  useEffect(() => {
    if (!organisationId) {
      setContacts([]);
      return;
    }
    void crmDb
      .contacts()
      .select("*")
      .eq("organisation_id", organisationId)
      .order("full_name")
      .then(({ data }: { data: CrmContact[] | null }) =>
        setContacts(data || [])
      );
  }, [organisationId]);

  useEffect(() => {
    if (presetType) setType(presetType);
  }, [presetType]);

  async function save() {
    if (!profile || !organisationId || !summary.trim()) {
      setMessage("Organisation and summary are required.");
      return;
    }
    setSaving(true);
    setMessage(null);

    const { error: engErr } = await crmDb.engagements().insert({
      organisation_id: organisationId,
      contact_id: contactId || null,
      type,
      summary: summary.trim(),
      outcome: outcome.trim() || null,
      created_by: profile.id,
      occurred_at: new Date().toISOString(),
    });

    if (engErr) {
      setSaving(false);
      setMessage(engErr.message);
      return;
    }

    if (followUpTitle.trim() && followUpDate) {
      await crmDb.tasks().insert({
        organisation_id: organisationId,
        contact_id: contactId || null,
        title: followUpTitle.trim(),
        due_date: followUpDate,
        owner_id: profile.id,
        status: "open",
        priority: "normal",
      });
    }

    setSaving(false);
    router.push("/space-place/activity");
  }

  const showForm = Boolean(presetType);

  return (
    <div>
      <PageTitle title="Add" subtitle="Log an interaction quickly" />

      {!showForm ? (
        <div className="grid gap-3">
          {QUICK_TYPES.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => router.push(`/space-place/add?type=${item.type}`)}
              className="min-h-[56px] rounded-2xl border border-neutral-200 bg-white px-5 text-left text-lg font-semibold shadow-sm active:bg-neutral-50"
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => router.push("/space-place/add?type=note&voice=1")}
            className="min-h-[56px] rounded-2xl border-2 border-dashed border-[#c1121f]/40 bg-white px-5 text-left text-lg font-semibold text-[#c1121f]"
          >
            Voice Update
          </button>
          <p className="text-sm text-neutral-500">
            Voice capture uses Quick Update for now.
          </p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="block">
            <span className="text-sm font-semibold">Organisation</span>
            <select
              required
              value={organisationId}
              onChange={(e) => {
                setOrganisationId(e.target.value);
                setContactId("");
              }}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-3 text-base"
            >
              <option value="">Select…</option>
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
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-3 text-base"
            >
              <option value="">Optional</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.first_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-3 text-base"
            >
              {ENGAGEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Summary</span>
            <textarea
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Outcome</span>
            <input
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Next action (task title)</span>
            <input
              value={followUpTitle}
              onChange={(e) => setFollowUpTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Follow-up date</span>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
            />
          </label>

          {message ? <p className="text-sm text-red-600">{message}</p> : null}
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </form>
      )}
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense fallback={<p className="text-neutral-600">Loading…</p>}>
      <AddPageContent />
    </Suspense>
  );
}
