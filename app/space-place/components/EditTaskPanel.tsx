"use client";

import { useEffect, useMemo, useState } from "react";
import { crmDb } from "@/lib/space-place/db";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/space-place/constants";
import { FIELD_CLASS, LABEL_CLASS } from "@/lib/space-place/form-ui";
import type {
  CrmContact,
  CrmOrganisation,
  CrmProfile,
  CrmTaskWithRelations,
} from "@/lib/space-place/types";
import { formatSpacerOptionLabel } from "@/lib/space-place/spacers";
import { useSpacePlace } from "../SpacePlaceContext";
import { EditSlideOver } from "./EditSlideOver";

const FORM_ID = "edit-task-form";

type EditTaskPanelProps = {
  open: boolean;
  task: CrmTaskWithRelations;
  organisations: CrmOrganisation[];
  contacts: CrmContact[];
  assignees: CrmProfile[];
  onClose: () => void;
  onSaved: () => void;
};

export function EditTaskPanel({
  open,
  task,
  organisations,
  contacts,
  assignees,
  onClose,
  onSaved,
}: EditTaskPanelProps) {
  const { profile } = useSpacePlace();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [dueDate, setDueDate] = useState(task.due_date || "");
  const [status, setStatus] = useState(task.status || "open");
  const [priority, setPriority] = useState(task.priority || "normal");
  const [ownerId, setOwnerId] = useState(task.owner_id || "");
  const [organisationId, setOrganisationId] = useState(task.organisation_id || "");
  const [contactId, setContactId] = useState(task.contact_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(task.title);
    setDescription(task.description || "");
    setDueDate(task.due_date || "");
    setStatus(task.status || "open");
    setPriority(task.priority || "normal");
    setOwnerId(task.owner_id || "");
    setOrganisationId(task.organisation_id || "");
    setContactId(task.contact_id || "");
    setError(null);
    setSuccess(null);
  }, [open, task]);

  useEffect(() => {
    if (!open || !profile) return;
    console.log({
      role: profile.role,
      organisationsLoaded: organisations.length,
      contactsLoaded: contacts.length,
    });
  }, [open, profile, organisations.length, contacts.length]);

  const filteredContacts = useMemo(() => {
    if (!organisationId) return contacts;
    return contacts.filter((c) => c.organisation_id === organisationId);
  }, [contacts, organisationId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    if (!(TASK_STATUSES as readonly string[]).includes(status)) {
      setError("Status must be open, done or cancelled.");
      return;
    }
    if (!(TASK_PRIORITIES as readonly string[]).includes(priority)) {
      setError("Priority must be low, normal or high.");
      return;
    }
    if (!ownerId) {
      setError("Please choose an owner.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const patch: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      status,
      priority,
      owner_id: ownerId,
      organisation_id: organisationId || null,
      contact_id: contactId || null,
    };
    if (status === "done" && !task.completed_at) {
      patch.completed_at = new Date().toISOString();
    }
    if (status !== "done") {
      patch.completed_at = null;
    }

    const { error: updateErr } = await crmDb.tasks().update(patch).eq("id", task.id);
    setSaving(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setSuccess("Task updated.");
    onSaved();
    setTimeout(() => onClose(), 500);
  }

  return (
    <EditSlideOver
      open={open}
      title="Edit task"
      onClose={onClose}
      onSave={() => {}}
      saving={saving}
      error={error}
      success={success}
      formId={FORM_ID}
      saveLabel="Save"
      savingLabel="Saving..."
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className={LABEL_CLASS}>Title</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD_CLASS}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={FIELD_CLASS}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Assigned to</span>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={FIELD_CLASS}>
            <option value="">Select assignee</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {formatSpacerOptionLabel(assignee, assignees)} ({assignee.role})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Organisation</span>
          <select
            value={organisationId}
            onChange={(e) => {
              setOrganisationId(e.target.value);
              if (contactId) {
                const contactStillValid = contacts.some(
                  (c) => c.id === contactId && c.organisation_id === e.target.value
                );
                if (!contactStillValid) setContactId("");
              }
            }}
            className={FIELD_CLASS}
          >
            <option value="">Optional</option>
            {organisations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Contact</span>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={FIELD_CLASS}>
            <option value="">Optional</option>
            {filteredContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.full_name || contact.first_name || "Unnamed"}
              </option>
            ))}
          </select>
        </label>
      </form>
    </EditSlideOver>
  );
}
