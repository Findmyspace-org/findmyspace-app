"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Mail, Phone, User } from "lucide-react";
import type { CrmContact } from "@/lib/space-place/types";
import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";
import { resolveOrganisationContactStatus } from "@/lib/crm-desktop/organisation-contact-status";
import { crmContactMailHref, telHref } from "@/lib/space-place/contact-actions";
import { CreateContactPanel } from "@/app/space-place/components/CreateContactPanel";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { setCrmOrganisationPrimaryContact } from "@/lib/crm-desktop/api-client";
import { patchOrganisationRowPrimaryContact } from "@/lib/crm-desktop/organisation-contact-status";
import { CrmPipelinePrimaryContactPicker } from "./CrmPipelinePrimaryContactPicker";

type Props = {
  row: CrmOrganisationListRow;
  isDragging?: boolean;
  onRowPatched: (row: CrmOrganisationListRow) => void;
  onRefresh?: () => void;
};

export function CrmPipelineContactSummary({
  row,
  isDragging = false,
  onRowPatched,
  onRefresh,
}: Props) {
  const { isAdmin, canViewAllOrganisations, profile } = useSpacePlace();
  const status = resolveOrganisationContactStatus(row);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const mailto =
    status.primaryContact?.email && status.primaryContact.id
      ? crmContactMailHref(status.primaryContact.email, status.primaryContact.id)
      : null;
  const tel = telHref(status.primaryContact?.phone);

  function handleSummaryClick(event: React.MouseEvent) {
    event.stopPropagation();
    if (isDragging) return;
    if (status.contactWarningType === "no_contacts") {
      setCreateOpen(true);
      return;
    }
    if (status.contactWarningType === "primary_required") {
      setPickerOpen((open) => !open);
    }
  }

  function handleSummaryKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    if (status.contactWarningType === "no_contacts") setCreateOpen(true);
    else if (status.contactWarningType === "primary_required") setPickerOpen(true);
  }

  async function handleContactCreated(
    contact: CrmContact,
    requestedPrimary: boolean
  ) {
    const displayName =
      contact.full_name || contact.first_name || "Unnamed contact";
    let patched = {
      ...row,
      contact_count: row.contact_count + 1,
    } as CrmOrganisationListRow;

    if (requestedPrimary) {
      const result = await setCrmOrganisationPrimaryContact(row.id, contact.id);
      if (result.ok) {
        patched = patchOrganisationRowPrimaryContact(patched, {
          id: contact.id,
          name: displayName,
          role: contact.role,
          email: contact.email,
          phone: contact.phone || contact.whatsapp,
        });
      }
    }

    onRowPatched(patched);
    onRefresh?.();
    setCreateOpen(false);
  }

  return (
    <div ref={anchorRef} className="relative mt-1.5">
      {status.primaryContact ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
          <User className="h-3 w-3 shrink-0" />
          <span className="text-gray-500">Primary:</span>
          <Link
            href={`/admin/crm/contacts/${status.primaryContact.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-[#192a3a] hover:text-[#c1121f] hover:underline"
          >
            {status.primaryContact.name}
          </Link>
          {mailto ? (
            <a
              href={mailto}
              onClick={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-gray-400 hover:text-[#c1121f]"
              aria-label="Email primary contact"
            >
              <Mail className="h-3 w-3" />
            </a>
          ) : null}
          {tel ? (
            <a
              href={tel}
              onClick={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-gray-400 hover:text-[#c1121f]"
              aria-label="Call primary contact"
            >
              <Phone className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleSummaryClick}
          onKeyDown={handleSummaryKeyDown}
          className="cursor-pointer text-left text-xs text-amber-800 underline-offset-2 hover:text-amber-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30"
        >
          {status.summaryLabel}
        </button>
      )}

      <CrmPipelinePrimaryContactPicker
        row={row}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        anchorRef={anchorRef}
        onRowPatched={onRowPatched}
        onAddContact={() => setCreateOpen(true)}
      />

      {profile ? (
        <CreateContactPanel
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(contact, meta) => void handleContactCreated(contact, meta?.setAsPrimary ?? false)}
          isAdmin={isAdmin}
          canViewAllOrganisations={canViewAllOrganisations}
          userId={profile.id}
          defaultOrganisationId={row.id}
          offerSetAsPrimary
        />
      ) : null}
    </div>
  );
}
