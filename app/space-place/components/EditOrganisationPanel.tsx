"use client";

import { useEffect, useMemo, useState } from "react";
import { crmDb } from "@/lib/space-place/db";
import {
  ORGANISATION_STATUSES,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/space-place/constants";
import { FIELD_CLASS, LABEL_CLASS } from "@/lib/space-place/form-ui";
import { ORGANISATION_TYPES } from "@/lib/space-place/organisation-types";
import type { CrmOrganisation, CrmProfile } from "@/lib/space-place/types";
import { SpacerSelect } from "./SpacerSelect";
import { EditSlideOver } from "./EditSlideOver";

const FORM_ID = "edit-organisation-form";

type EditOrganisationPanelProps = {
  organisation: CrmOrganisation;
  open: boolean;
  onClose: () => void;
  onSaved: (organisation: CrmOrganisation) => void;
  isAdmin: boolean;
  spacers: CrmProfile[];
};

export function EditOrganisationPanel({
  organisation,
  open,
  onClose,
  onSaved,
  isAdmin,
  spacers,
}: EditOrganisationPanelProps) {
  const [name, setName] = useState(organisation.name);
  const [type, setType] = useState(organisation.type || "");
  const [status, setStatus] = useState(organisation.status);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>(
    organisation.pipeline_stage
  );
  const [website, setWebsite] = useState(organisation.website || "");
  const [address, setAddress] = useState(organisation.address || "");
  const [notes, setNotes] = useState(organisation.notes || "");
  const [lostReason, setLostReason] = useState(organisation.lost_reason || "");
  const [assignedTo, setAssignedTo] = useState(organisation.assigned_to || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const statusOptions = useMemo(() => {
    const opts = [...ORGANISATION_STATUSES];
    if (
      status &&
      !opts.includes(status as (typeof ORGANISATION_STATUSES)[number])
    ) {
      return [status, ...opts];
    }
    return opts;
  }, [status]);

  const typeOptions = useMemo(() => {
    const known = ORGANISATION_TYPES.map((t) => t.value as string);
    if (type && !known.includes(type)) {
      return [{ value: type, label: type }, ...ORGANISATION_TYPES];
    }
    return [...ORGANISATION_TYPES];
  }, [type]);

  useEffect(() => {
    if (!open) return;
    setName(organisation.name);
    setType(organisation.type || "");
    setStatus(organisation.status);
    setPipelineStage(organisation.pipeline_stage);
    setWebsite(organisation.website || "");
    setAddress(organisation.address || "");
    setNotes(organisation.notes || "");
    setLostReason(organisation.lost_reason || "");
    setAssignedTo(organisation.assigned_to || "");
    setError(null);
    setSuccess(null);
  }, [open, organisation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Organisation name is required.");
      setSuccess(null);
      return;
    }
    if (pipelineStage === "closed_lost" && !lostReason.trim()) {
      setError("A reason is required when pipeline stage is Closed / Not Now.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const patch: Record<string, unknown> = {
      name: name.trim(),
      type: type.trim() || null,
      status: status.trim() || "new",
      pipeline_stage: pipelineStage,
      website: website.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      lost_reason:
        pipelineStage === "closed_lost" ? lostReason.trim() : null,
    };

    if (isAdmin) {
      patch.assigned_to = assignedTo.trim() || null;
    }

    const { data, error: updateErr } = await crmDb
      .organisations()
      .update(patch)
      .eq("id", organisation.id)
      .select("*")
      .single();

    setSaving(false);

    if (updateErr || !data) {
      setError(updateErr?.message || "Could not save changes.");
      return;
    }

    const updated = data as CrmOrganisation;
    setSuccess("Space saved.");
    onSaved(updated);
    setTimeout(() => {
      onClose();
    }, 600);
  }

  return (
    <EditSlideOver
      open={open}
      title="Edit space"
      onClose={onClose}
      onSave={() => {}}
      saving={saving}
      error={error}
      success={success}
      formId={FORM_ID}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className={LABEL_CLASS}>Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Select type</option>
            {typeOptions.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
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
          <span className={LABEL_CLASS}>Pipeline stage</span>
          <select
            value={pipelineStage}
            onChange={(e) =>
              setPipelineStage(e.target.value as PipelineStage)
            }
            className={FIELD_CLASS}
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {PIPELINE_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        {pipelineStage === "closed_lost" ? (
          <label className="block">
            <span className={LABEL_CLASS}>Closed reason</span>
            <input
              required
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              className={FIELD_CLASS}
            />
          </label>
        ) : null}

        <label className="block">
          <span className={LABEL_CLASS}>Website</span>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className={FIELD_CLASS}
            placeholder="https://"
          />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Address</span>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className={FIELD_CLASS}
          />
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

        {isAdmin ? (
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
