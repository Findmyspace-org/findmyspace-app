"use client";

import { useCallback, useEffect, useState } from "react";
import { crmDb } from "@/lib/space-place/db";
import { resolveAssignedToForCreate } from "@/lib/space-place/crm-assign";
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

const FORM_ID = "create-organisation-form";

type CreateOrganisationPanelProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (organisation: CrmOrganisation) => void;
  isAdmin: boolean;
  canViewAllOrganisations: boolean;
  userId: string;
  spacers: CrmProfile[];
};

export function CreateOrganisationPanel({
  open,
  onClose,
  onCreated,
  isAdmin,
  canViewAllOrganisations,
  userId,
  spacers,
}: CreateOrganisationPanelProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("active");
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("prospect");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [assignedTo, setAssignedTo] = useState(userId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setType("");
    setStatus("active");
    setPipelineStage("prospect");
    setWebsite("");
    setAddress("");
    setNotes("");
    setLostReason("");
    setAssignedTo(userId);
    setError(null);
    setSuccess(null);
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

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

    const assigned = resolveAssignedToForCreate(
      canViewAllOrganisations,
      userId,
      assignedTo
    );

    const { data, error: insertErr } = await crmDb
      .organisations()
      .insert({
        name: name.trim(),
        type: type.trim() || null,
        status: status.trim() || "active",
        pipeline_stage: pipelineStage,
        website: website.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        lost_reason:
          pipelineStage === "closed_lost" ? lostReason.trim() : null,
        assigned_to: assigned,
      })
      .select("*")
      .single();

    setSaving(false);

    if (insertErr || !data) {
      setError(insertErr?.message || "Could not create organisation.");
      return;
    }

    const created = data as CrmOrganisation;
    setSuccess("Organisation created.");
    onCreated(created);
    setTimeout(() => {
      onClose();
    }, 600);
  }

  return (
    <EditSlideOver
      open={open}
      title="New organisation"
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
          <span className={LABEL_CLASS}>Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD_CLASS}
            placeholder="Organisation name"
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
            {ORGANISATION_TYPES.map((t) => (
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
            {ORGANISATION_STATUSES.map((s) => (
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
            This space will be assigned to you.
          </p>
        )}
      </form>
    </EditSlideOver>
  );
}
