"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { crmDb } from "@/lib/space-place/db";
import type { CrmProfile } from "@/lib/space-place/types";
import {
  dedupeActiveSpacers,
  findSchalkAdminProfile,
  formatSpacerOptionLabel,
} from "@/lib/space-place/spacers";

export type TaskReassignResult = {
  taskId: string;
  ownerId: string;
  ownerName: string;
};

type TaskReassignControlProps = {
  taskId: string;
  currentOwnerId: string | null;
  assignees: CrmProfile[];
  currentUserId: string;
  disabled?: boolean;
  onReassigned: (result: TaskReassignResult) => void;
};

export function TaskReassignControl({
  taskId,
  currentOwnerId,
  assignees,
  currentUserId,
  disabled = false,
  onReassigned,
}: TaskReassignControlProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const roster = useMemo(() => dedupeActiveSpacers(assignees), [assignees]);
  const schalkProfile = useMemo(
    () => findSchalkAdminProfile(assignees),
    [assignees]
  );
  const showSchalkShortcut =
    schalkProfile &&
    schalkProfile.id !== currentUserId &&
    schalkProfile.id !== currentOwnerId;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function reassignTo(ownerId: string) {
    if (!ownerId || ownerId === currentOwnerId || saving) return;
    setSaving(true);
    setFeedback(null);

    const { error } = await crmDb
      .tasks()
      .update({ owner_id: ownerId, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    setSaving(false);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    const profile = roster.find((p) => p.id === ownerId);
    const ownerName = profile
      ? formatSpacerOptionLabel(profile, roster)
      : "Spacer";

    setFeedback({ type: "success", text: `Assigned to ${ownerName}` });
    setOpen(false);
    onReassigned({ taskId, ownerId, ownerName });
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || saving}
        className="min-h-[40px] rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 disabled:opacity-60"
      >
        Reassign
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg sm:right-auto sm:min-w-[240px]">
          {showSchalkShortcut ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void reassignTo(schalkProfile.id)}
              className="mb-1 w-full rounded-lg bg-neutral-900 px-3 py-2 text-left text-sm font-semibold text-white disabled:opacity-60"
            >
              Assign to {formatSpacerOptionLabel(schalkProfile, roster)}
            </button>
          ) : null}
          {roster.map((profile) => (
            <button
              key={profile.id}
              type="button"
              disabled={saving || profile.id === currentOwnerId}
              onClick={() => void reassignTo(profile.id)}
              className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              <span className="font-medium text-neutral-900">
                {formatSpacerOptionLabel(profile, roster)}
              </span>
              <span className="text-xs capitalize text-neutral-500">
                {profile.role.replace("_", " ")}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {feedback ? (
        <p
          className={`mt-1 text-xs ${
            feedback.type === "error" ? "text-red-600" : "text-green-700"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
