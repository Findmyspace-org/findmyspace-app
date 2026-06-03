"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { crmDb } from "@/lib/space-place/db";
import { resolveAssignedToForCreate } from "@/lib/space-place/crm-assign";
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

const FORM_ID = "create-contact-form";

type CreateContactPanelProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (contact: CrmContact) => void;
  /** True admin only (reserved for admin-only UI). */
  isAdmin: boolean;
  /** Admin or office_manager — all orgs in dropdown. */
  canViewAllOrganisations: boolean;
  userId: string;
  defaultOrganisationId?: string;
};

export function CreateContactPanel({
  open,
  onClose,
  onCreated,
  isAdmin,
  canViewAllOrganisations,
  userId,
  defaultOrganisationId = "",
}: CreateContactPanelProps) {
  const [organisations, setOrganisations] = useState<CrmOrganisation[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [organisationId, setOrganisationId] = useState(defaultOrganisationId);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [status, setStatus] = useState("lead");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState(userId);
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

  const resetForm = useCallback(() => {
    setOrganisationId(defaultOrganisationId);
    setFirstName("");
    setLastName("");
    setFullName("");
    setRole("");
    setEmail("");
    setPhone("");
    setWhatsapp("");
    setStatus("lead");
    setNotes("");
    setAssignedTo(userId);
    setError(null);
    setSuccess(null);
  }, [defaultOrganisationId, userId]);

  useEffect(() => {
    if (!open) return;
    resetForm();
    void loadOptions();
  }, [open, resetForm, loadOptions]);

  useEffect(() => {
    if (!open || !defaultOrganisationId) return;
    setOrganisationId(defaultOrganisationId);
  }, [open, defaultOrganisationId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organisationId) {
      setError("Please select an organisation.");
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

    const assigned = resolveAssignedToForCreate(
      canViewAllOrganisations,
      userId,
      assignedTo
    );

    const { data, error: insertErr } = await crmDb
      .contacts()
      .insert({
        organisation_id: organisationId,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        full_name: resolvedName,
        role: role.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        status: status.trim() || "lead",
        notes: notes.trim() || null,
        assigned_to: assigned,
      })
      .select("*")
      .single();

    setSaving(false);

    if (insertErr || !data) {
      setError(insertErr?.message || "Could not create contact.");
      return;
    }

    setSuccess("Contact created.");
    onCreated(data as CrmContact);
    setTimeout(() => {
      onClose();
    }, 600);
  }

  return (
    <EditSlideOver
      open={open}
      title="New contact"
      onClose={onClose}
      onSave={() => {}}
      saving={saving}
      error={error}
      success={success}
      formId={FORM_ID}
      saveLabel="Create"
      savingLabel="Creating…"
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className={LABEL_CLASS}>Organisation</span>
          <select
            required
            value={organisationId}
            onChange={(e) => setOrganisationId(e.target.value)}
            className={FIELD_CLASS}
            disabled={organisations.length === 0}
          >
            <option value="">
              {organisations.length === 0
                ? "No accessible organisations"
                : "Select organisation"}
            </option>
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
              includeUnassigned={false}
            />
          </label>
        ) : (
          <p className="text-sm text-neutral-600">
            This contact will be assigned to you.
          </p>
        )}
      </form>
    </EditSlideOver>
  );
}
