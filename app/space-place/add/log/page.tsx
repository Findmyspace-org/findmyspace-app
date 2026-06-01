"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crmDb } from "@/lib/space-place/db";
import { ENGAGEMENT_TYPES } from "@/lib/space-place/constants";
import { displayName } from "@/lib/space-place/format";
import { FIELD_CLASS, LABEL_CLASS } from "@/lib/space-place/form-ui";
import type { CrmContact, CrmOrganisation } from "@/lib/space-place/types";
import { useSpacePlace } from "../../SpacePlaceContext";
import { PageTitle, PrimaryButton } from "../../components/SpacePlaceShell";

export default function LogInteractionPage() {
  const router = useRouter();
  const { isAdmin, profile } = useSpacePlace();

  const [orgs, setOrgs] = useState<CrmOrganisation[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [organisationId, setOrganisationId] = useState("");
  const [contactId, setContactId] = useState("");
  const [type, setType] = useState("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    let oq = crmDb.organisations().select("*").order("name");
    if (!isAdmin && profile) {
      oq = oq.eq("assigned_to", profile.id);
    }
    const { data } = await oq;
    setOrgs((data as CrmOrganisation[]) || []);
  }, [isAdmin, profile]);

  useEffect(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setOccurredAt(local);
    void loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (!organisationId) {
      setContacts([]);
      setContactId("");
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
    if (!organisationId) {
      setMessage("Please select a space.");
      return;
    }
    if (!summary.trim()) {
      setMessage("Please add a summary.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const occurredIso = occurredAt
      ? new Date(occurredAt).toISOString()
      : new Date().toISOString();

    const { error } = await crmDb.engagements().insert({
      organisation_id: organisationId,
      contact_id: contactId || null,
      type,
      summary: summary.trim(),
      occurred_at: occurredIso,
      created_by: profile?.id ?? null,
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push(
      contactId
        ? `/space-place/contacts/${contactId}`
        : `/space-place/organisations/${organisationId}`
    );
  }

  return (
    <form onSubmit={save} className="space-y-4 pb-6">
      <Link
        href="/space-place/add"
        className="text-sm font-semibold text-[#c1121f]"
      >
        ← Back to Add
      </Link>

      <PageTitle
        title="Log Interaction"
        subtitle="Record a call, message, meeting or note"
      />

      <label className="block">
        <span className={LABEL_CLASS}>Space / Organisation</span>
        <select
          required
          value={organisationId}
          onChange={(e) => {
            setOrganisationId(e.target.value);
            setContactId("");
          }}
          className={FIELD_CLASS}
        >
          <option value="">Select space</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Contact</span>
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          className={FIELD_CLASS}
          disabled={!organisationId}
        >
          <option value="">Optional</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {displayName(c.full_name, c.first_name, c.last_name)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={FIELD_CLASS}
        >
          {ENGAGEMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>When</span>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Summary</span>
        <textarea
          required
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={5}
          className={FIELD_CLASS}
          placeholder="What was discussed? Outcome and next steps?"
        />
      </label>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}

      <PrimaryButton type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save interaction"}
      </PrimaryButton>
    </form>
  );
}
