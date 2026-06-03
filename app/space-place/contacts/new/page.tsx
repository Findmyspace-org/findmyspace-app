"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crmDb } from "@/lib/space-place/db";
import { FIELD_CLASS, LABEL_CLASS } from "@/lib/space-place/form-ui";
import type { CrmOrganisation, CrmProfile } from "@/lib/space-place/types";
import { useSpacePlace } from "../../SpacePlaceContext";
import { PageTitle, PrimaryButton } from "../../components/SpacePlaceShell";
import { SpacerSelect } from "../../components/SpacerSelect";

export default function NewContactPage() {
  const router = useRouter();
  const { isAdmin, canViewAllOrganisations, profile } = useSpacePlace();

  const [orgs, setOrgs] = useState<CrmOrganisation[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [organisationId, setOrganisationId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    let oq = crmDb.organisations().select("*").order("name");
    if (!canViewAllOrganisations && profile) {
      oq = oq.eq("assigned_to", profile.id);
    }

    const [oRes, sRes] = await Promise.all([
      oq,
      canViewAllOrganisations
        ? crmDb.profiles().select("*").eq("active", true)
        : Promise.resolve({ data: [] }),
    ]);

    setOrgs((oRes.data as CrmOrganisation[]) || []);
    setSpacers((sRes.data as CrmProfile[]) || []);
  }, [canViewAllOrganisations, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!organisationId) return;
    const org = orgs.find((o) => o.id === organisationId);
    if (org?.assigned_to && !assignedTo) {
      setAssignedTo(org.assigned_to);
    }
  }, [organisationId, orgs, assignedTo]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!organisationId) {
      setMessage("Please select a space.");
      return;
    }
    if (!firstName.trim() && !lastName.trim() && !phone.trim() && !email.trim()) {
      setMessage("Add a name or at least phone or email.");
      return;
    }

    const first = firstName.trim();
    const last = lastName.trim();
    const fullName = [first, last].filter(Boolean).join(" ") || "Contact";
    const assignee =
      assignedTo ||
      orgs.find((o) => o.id === organisationId)?.assigned_to ||
      (canViewAllOrganisations ? null : profile?.id) ||
      null;

    setSaving(true);
    setMessage(null);

    const { data, error } = await crmDb
      .contacts()
      .insert({
        organisation_id: organisationId,
        first_name: first || null,
        last_name: last || null,
        full_name: fullName,
        role: role.trim() || null,
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        assigned_to: assignee,
        status: "active",
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !data) {
      setMessage(error?.message || "Could not save contact.");
      return;
    }

    router.push(`/space-place/contacts/${(data as { id: string }).id}`);
  }

  return (
    <form onSubmit={save} className="space-y-4 pb-6">
      <Link
        href="/space-place/add"
        className="text-sm font-semibold text-[#c1121f]"
      >
        ← Back to Add
      </Link>

      <PageTitle title="Add Contact" subtitle="Add a person to an existing space" />

      <label className="block">
        <span className={LABEL_CLASS}>Space / Organisation</span>
        <select
          required
          value={organisationId}
          onChange={(e) => setOrganisationId(e.target.value)}
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

      {canViewAllOrganisations ? (
        <label className="block">
          <span className={LABEL_CLASS}>Assigned Spacer</span>
          <SpacerSelect
            value={assignedTo}
            onChange={setAssignedTo}
            spacers={spacers}
          />
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL_CLASS}>First name</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Last name</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      </div>

      <label className="block">
        <span className={LABEL_CLASS}>Role</span>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Cell phone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>WhatsApp</span>
        <input
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={FIELD_CLASS}
        />
      </label>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}

      <PrimaryButton type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save contact"}
      </PrimaryButton>
    </form>
  );
}
