"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { formatDateTime } from "@/lib/space-place/format";
import { emailPreview } from "@/lib/space-place/crm-email";
import type { CrmEmailMessageWithRelations } from "@/lib/space-place/types";
import { Card } from "./SpacePlaceShell";
import { CrmEmailDetailDrawer } from "@/app/components/crm-desktop/CrmEmailDetailDrawer";

export function CrmEmailList({
  emails,
  emptyMessage = "No emails logged yet.",
  adminLinks = false,
}: {
  emails: CrmEmailMessageWithRelations[];
  emptyMessage?: string;
  /** Use /admin/crm/... links in the detail drawer */
  adminLinks?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openEmail = useCallback((id: string) => {
    setOpenId(id);
  }, []);

  const closeEmail = useCallback(() => {
    setOpenId(null);
  }, []);

  if (emails.length === 0) {
    return <p className="text-neutral-500">{emptyMessage}</p>;
  }

  const selected = emails.find((e) => e.id === openId) ?? null;

  return (
    <>
      <div className="space-y-2">
        {emails.map((email) => {
          const contact = email.crm_contacts;
          const org = email.crm_organisations;
          const toPreview = (email.to_emails || []).slice(0, 2).join(", ");
          const preview = emailPreview(email.body_text);
          const subject = email.subject?.trim() || "(No subject)";

          return (
            <Card
              key={email.id}
              className="mb-0 cursor-pointer border border-transparent transition hover:border-[#c1121f]/40 hover:shadow-sm focus-within:border-[#c1121f]/40"
            >
              <div
                role="button"
                tabIndex={0}
                aria-label={`Open email: ${subject}`}
                className="outline-none"
                onClick={() => openEmail(email.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openEmail(email.id);
                  }
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-[#192a3a] underline-offset-2 hover:underline">
                    {subject}
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
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {email.engagement_id ? (
                  <span className="rounded-full bg-green-50 px-2 py-1 font-medium text-green-800">
                    Logged to activity
                  </span>
                ) : null}
                {contact ? (
                  <Link
                    href={
                      adminLinks
                        ? `/admin/crm/contacts/${contact.id}`
                        : `/space-place/contacts/${contact.id}`
                    }
                    className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-900"
                    onClick={(e) => e.stopPropagation()}
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
                    href={
                      adminLinks
                        ? `/admin/crm/organisations/${org.id}`
                        : `/space-place/organisations/${org.id}`
                    }
                    className="rounded-full bg-neutral-100 px-2 py-1 text-neutral-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {org.name}
                  </Link>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      <CrmEmailDetailDrawer
        email={selected}
        open={Boolean(selected)}
        onClose={closeEmail}
        adminLinks={adminLinks}
      />
    </>
  );
}
