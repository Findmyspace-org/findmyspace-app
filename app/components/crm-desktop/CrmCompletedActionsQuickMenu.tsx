"use client";

import { useState } from "react";
import Link from "next/link";
import {
  COMPLETED_ACTIONS_HELPER_TEXT,
  quickStandardActionsForScope,
  type CompletedActionScope,
} from "@/lib/crm-desktop/completed-actions";
import { createCompletedActionApi } from "@/lib/crm-desktop/completed-actions-api";
import { completedActionHref } from "@/app/components/crm-desktop/CrmCompletedActionsPanel";

type Props = {
  organisationId: string;
  propertyId?: string | null;
  spaceId?: string | null;
  onDone?: () => void;
};

export function CrmCompletedActionsQuickMenu({
  organisationId,
  propertyId,
  spaceId,
  onDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const scope: CompletedActionScope = spaceId
    ? "space"
    : propertyId
      ? "property"
      : "organisation";
  const shortcuts = quickStandardActionsForScope(scope);

  async function mark(key: string) {
    setBusy(key);
    setMessage(null);
    try {
      await createCompletedActionApi({
        organisationId,
        propertyId: propertyId || null,
        spaceId: spaceId || null,
        actionKey: key,
        source: "admin_quick_action",
      });
      setMessage("Recorded.");
      onDone?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(null);
    }
  }

  const viewHref = completedActionHref({
    organisationId,
    propertyId: propertyId || undefined,
    spaceId: spaceId || undefined,
  });

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
      >
        Completed actions
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
          <p className="px-3 pb-2 text-[11px] leading-snug text-gray-500">
            {COMPLETED_ACTIONS_HELPER_TEXT}
          </p>
          <Link
            href={viewHref}
            className="block px-3 py-1.5 text-xs font-medium text-[#c1121f] hover:bg-gray-50"
          >
            View completed actions
          </Link>
          <Link
            href={viewHref}
            className="block px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            Add completed action
          </Link>
          <div className="my-1 border-t border-gray-100" />
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Mark as done
          </p>
          {shortcuts.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={busy === action.key}
              onClick={() => void mark(action.key)}
              className="block w-full px-3 py-1.5 text-left text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === action.key ? "Saving…" : action.label}
            </button>
          ))}
          {message ? (
            <p className="px-3 pt-1 text-[11px] text-gray-600">{message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
