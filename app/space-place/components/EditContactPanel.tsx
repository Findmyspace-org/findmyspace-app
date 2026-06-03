"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { crmDb } from "@/lib/space-place/db";
import { CONTACT_STATUSES } from "@/lib/space-place/constants";
import {
  contactNameIsValid,
  resolveContactFullName,
} from "@/lib/space-place/format";
import { FIELD_CLASS, LABEL_CLASS } from "@/lib/space-place/form-ui";
import type {
  CrmContact,
  CrmOrganisation,
  CrmProfile,
} from "@/lib/space-place/types";
import { SpacerSelect } from "./SpacerSelect";
import { EditSlideOver } from "./EditSlideOver";

const FORM_ID = "edit-contact-form";

type EditContactPanelProps = {
  contact: CrmContact;
  open: boolean;
  onClose: () => void;
  onSaved: (contact: CrmContact, organisation: CrmOrganisation | null) => void;
  isAdmin: boolean;
  canViewAllOrganisations: boolean;
  userId: string;
};

export function EditContactPanel({
  contact,
  open,
  onClose,
  onSaved,
  isAdmin,
  canViewAllOrganisations,
  userId,
}: EditContactPanelProps) {
  const [organisations, setOrganisations] = useState<CrmOrganisation[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [organisationId, setOrganisationId] = useState(contact.organisation_id);
  const [firstName, setFirstName] = useState(contact.first_name || "");
  const [lastName, setLastName] = useState(contact.last_name || "");
  const [fullName, setFullName] = useState(contact.full_name || "");
  const [role, setRole] = useState(contact.role || "");
  const [email, setEmail] = useState(contact.email || "");
  const [phone, setPhone] = useState(contact.phone || "");
  const [whatsapp, setWhatsapp] = useState(contact.whatsapp || "");
  const [status, setStatus] = useState(contact.status || "active");
  const [notes, setNotes] = useState(contact.notes || "");
  const [assignedTo, setAssignedTo] = useState(contact.assigned_to || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const statusOptions = useMemo(() => {
    const opts = [...CONTACT_STATUSES];
    if (status && !opts.includes(status as (typeof CONTACT_STATUSES)[number])) {
      return [status, ...opts];
    }
    return opts;
  }, [status]);

  const loadOptions = useCallback(async () => {
    let oq = crmDb.organisations().select("*").order("name");
    if (!canViewAllOrganisations) {
      oq = oq.eq("assigned_to", userId);
    }

    const [oRes, sRes] = await Promise.all([
      oq,
      canViewAllOrganisations
        ? crmDb.profiles().select("*").eq("active", true).order("full_name")
        : Promise.resolve({ data: [] }),
    ]);

    setOrganisations((oRes.data as CrmOrganisation[]) || []);
    setSpacers((sRes.data as CrmProfile[]) || []);
  }, [canViewAllOrganisations, userId]);

  useEffect(() => {
    if (!open) return;
    setOrganisationId(contact.organisation_id);
    setFirstName(contact.first_name || "");
    setLastName(contact.last_name || "");
    setFullName(contact.full_name || "");
    setRole(contact.role || "");
    setEmail(contact.email || "");
    setPhone(contact.phone || "");
    setWhatsapp(contact.whatsapp || "");
    setStatus(contact.status || "active");
    setNotes(contact.notes || "");
    setAssignedTo(contact.assigned_to || "");
    setError(null);
    setSuccess(null);
    void loadOptions();
  }, [open, contact, loadOptions]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organisationId) {
      setError("Please select a space.");
      setSuccess(null);
      return;
    }
    if (!contactNameIsValid(fullName, firstName, lastName)) {
      setError("Full name or first name is required.");
      setSuccess(null);
      return;
    }

    const resolvedName = resolveContactFullName(fullName, firstName, lastName);
    if (!resolvedName) {
      setError("Full name or first name is required.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const patch: Record<string, unknown> = {
      organisation_id: organisationId,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      full_name: resolvedName,
      role: role.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      status: status.trim() || null,
      notes: notes.trim() || null,
    };

    if (canViewAllOrganisations) {
      patch.assigned_to = assignedTo.trim() || null;
    }

    const { data, error: updateErr } = await crmDb
      .contacts()
      .update(patch)
      .eq("id", contact.id)
      .select("*")
      .single();

    setSaving(false);

    if (updateErr || !data) {
      setError(updateErr?.message || "Could not save changes.");
      return;
    }

    const updated = data as CrmContact;

    const { data: orgData } = await crmDb
      .organisations()
      .select("*")
      .eq("id", updated.organisation_id)
      .maybeSingle();

    setSuccess("Contact saved.");
    onSaved(updated, (orgData as CrmOrganisation) || null);
    setTimeout(() => {
      onClose();
    }, 600);
  }

  return (
    <EditSlideOver
      open={open}
      title="Edit contact"
      onClose={onClose}
      onSave={() => {}}
      saving={saving}
      error={error}
      success={success}
      formId={FORM_ID}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className={LABEL_CLASS}>Space / Organisation</span>
          <select
            required
            value={organisationId}
            onChange={(e) => setOrganisationId(e.target.value)}
            className={FIELD_CLASS}
          >
            {organisations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={FIELD_CLASS}
            placeholder="Display name"
          />
        </label>

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
          <span className={LABEL_CLASS}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Phone</span>
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
          <span className={LABEL_CLASS}>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={FIELD_CLASS}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className={FIELD_CLASS}
          />
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
      </form>
    </EditSlideOver>
  );
}
