"use client";

import Link from "next/link";
import { formatDateTime } from "@/lib/space-place/format";
import { emailPreview } from "@/lib/space-place/crm-email";
import type { CrmEmailMessageWithRelations } from "@/lib/space-place/types";
import { Card } from "./SpacePlaceShell";

export function CrmEmailList({
  emails,
  emptyMessage = "No emails logged yet.",
}: {
  emails: CrmEmailMessageWithRelations[];
  emptyMessage?: string;
}) {
  if (emails.length === 0) {
    return <p className="text-neutral-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {emails.map((email) => {
        const contact = email.crm_contacts;
        const org = email.crm_organisations;
        const toPreview = (email.to_emails || []).slice(0, 2).join(", ");
        const preview = emailPreview(email.body_text);

        return (
          <Card key={email.id} className="mb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold text-neutral-900">
                {email.subject?.trim() || "(No subject)"}
              </p>
              <span className="text-xs text-neutral-500">
                {email.sent_at ? formatDateTime(email.sent_at) : "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              From {email.from_email || "—"}
              {toPreview ? ` · To ${toPreview}` : null}
            </p>
            {preview ? (
              <p className="mt-2 text-sm text-neutral-600">{preview}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {email.engagement_id ? (
                <span className="rounded-full bg-green-50 px-2 py-1 font-medium text-green-800">
                  Logged to activity
                </span>
              ) : null}
              {contact ? (
                <Link
                  href={`/space-place/contacts/${contact.id}`}
                  className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-900"
                >
                  {contact.full_name || contact.email}
                </Link>
              ) : (
                <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-900">
                  Unlinked
                </span>
              )}
              {org ? (
                <Link
                  href={`/space-place/organisations/${org.id}`}
                  className="rounded-full bg-neutral-100 px-2 py-1 text-neutral-700"
                >
                  {org.name}
                </Link>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
