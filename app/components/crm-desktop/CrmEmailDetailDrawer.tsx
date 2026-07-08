"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { formatDateTime } from "@/lib/space-place/format";
import {
  CRM_EMAIL_MISSING_BODY_MESSAGE,
  crmEmailBodyKind,
  sanitizeCrmEmailHtml,
} from "@/lib/space-place/crm-email-sanitize";
import type { CrmEmailMessageWithRelations } from "@/lib/space-place/types";

export type CrmEmailDetailMessage = CrmEmailMessageWithRelations & {
  body_html?: string | null;
  body_text?: string | null;
};

type Props = {
  email: CrmEmailDetailMessage | null;
  open: boolean;
  onClose: () => void;
  /** Prefer admin CRM links when true */
  adminLinks?: boolean;
  /** Optional link/unlink controls for desktop unlinked workflow */
  linkControls?: ReactNode;
};

function contactHref(id: string, adminLinks?: boolean) {
  return adminLinks
    ? `/admin/crm/contacts/${id}`
    : `/space-place/contacts/${id}`;
}

function orgHref(id: string, adminLinks?: boolean) {
  return adminLinks
    ? `/admin/crm/organisations/${id}`
    : `/space-place/organisations/${id}`;
}

export function CrmEmailDetailDrawer({
  email,
  open,
  onClose,
  adminLinks = false,
  linkControls,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !email) return null;

  const contact = email.crm_contacts;
  const org = email.crm_organisations;
  const kind = crmEmailBodyKind(email.body_html, email.body_text);
  const safeHtml =
    kind === "html" ? sanitizeCrmEmailHtml(email.body_html) : "";
  const toList = (email.to_emails || []).filter(Boolean);
  const ccList = (email.cc_emails || []).filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Email detail"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Email
            </p>
            <h2 className="mt-0.5 break-words text-lg font-semibold text-[#192a3a]">
              {email.subject?.trim() || "(No subject)"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
            aria-label="Close email"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-gray-100 px-4 py-3 text-sm text-gray-700">
          <dl className="grid gap-2 sm:grid-cols-[6.5rem_1fr]">
            <dt className="text-xs font-medium uppercase text-gray-500">From</dt>
            <dd className="break-all">{email.from_email || "—"}</dd>

            <dt className="text-xs font-medium uppercase text-gray-500">To</dt>
            <dd className="break-all">{toList.length ? toList.join(", ") : "—"}</dd>

            {ccList.length ? (
              <>
                <dt className="text-xs font-medium uppercase text-gray-500">Cc</dt>
                <dd className="break-all">{ccList.join(", ")}</dd>
              </>
            ) : null}

            <dt className="text-xs font-medium uppercase text-gray-500">Sent</dt>
            <dd>{email.sent_at ? formatDateTime(email.sent_at) : "—"}</dd>

            <dt className="text-xs font-medium uppercase text-gray-500">
              Direction
            </dt>
            <dd className="capitalize">{email.direction || "—"}</dd>

            <dt className="text-xs font-medium uppercase text-gray-500">Contact</dt>
            <dd>
              {contact ? (
                <Link
                  href={contactHref(contact.id, adminLinks)}
                  className="text-[#c1121f] hover:underline"
                >
                  {contact.full_name || contact.email || "Contact"}
                </Link>
              ) : (
                <span className="text-amber-800">Unlinked</span>
              )}
            </dd>

            <dt className="text-xs font-medium uppercase text-gray-500">
              Organisation
            </dt>
            <dd>
              {org ? (
                <Link
                  href={orgHref(org.id, adminLinks)}
                  className="text-[#c1121f] hover:underline"
                >
                  {org.name}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </dl>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {kind === "html" && safeHtml ? (
            <div
              className="crm-email-body prose prose-sm max-w-none break-words text-[#192a3a] [&_a]:break-all [&_img]:max-w-full [&_pre]:whitespace-pre-wrap [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : kind === "text" ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-[#192a3a]">
              {email.body_text}
            </pre>
          ) : (
            <p className="text-sm text-gray-500">{CRM_EMAIL_MISSING_BODY_MESSAGE}</p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
          <div className="flex flex-wrap gap-2">{linkControls}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
