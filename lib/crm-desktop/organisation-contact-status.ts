import type { CrmOrganisationListRow } from "./types";
import { isCrmTaskOverdue } from "@/lib/space-place/next-task";
import {
  organisationHasAnyEmail,
  organisationHasAnyPhone,
  organisationHasContacts,
} from "./organisation-contact-completeness";

export type ContactWarningType = "none" | "no_contacts" | "primary_required";

export type OrganisationQualityAction =
  | "add_note"
  | "schedule_followup"
  | "complete_task"
  | "log_call";

export type OrganisationQualityIndicator = {
  key: string;
  label: string;
  action?: OrganisationQualityAction;
};

export type OrganisationContactStatus = {
  contactCount: number;
  hasContacts: boolean;
  hasPrimaryContact: boolean;
  contactWarningType: ContactWarningType;
  primaryContact: {
    id: string;
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  summaryLabel: string;
  summaryInteractive: boolean;
};

type ContactStatusInput = Pick<
  CrmOrganisationListRow,
  | "contact_count"
  | "primary_contact_id"
  | "primary_contact_name"
  | "primary_contact_role"
  | "primary_contact_email"
  | "primary_contact_phone"
>;

export function resolveOrganisationContactStatus(
  row: ContactStatusInput
): OrganisationContactStatus {
  const contactCount = row.contact_count ?? 0;
  const hasContacts = contactCount > 0;
  const hasPrimaryContact = Boolean(row.primary_contact_id);

  let contactWarningType: ContactWarningType = "none";
  if (!hasContacts) contactWarningType = "no_contacts";
  else if (!hasPrimaryContact) contactWarningType = "primary_required";

  const primaryContact =
    hasPrimaryContact && row.primary_contact_id
      ? {
          id: row.primary_contact_id,
          name: row.primary_contact_name || "Unknown contact",
          role: row.primary_contact_role,
          email: row.primary_contact_email,
          phone: row.primary_contact_phone,
        }
      : null;

  let summaryLabel = "No contacts added";
  let summaryInteractive = true;
  if (primaryContact) {
    summaryLabel = `Primary: ${primaryContact.name}`;
    summaryInteractive = true;
  } else if (hasContacts) {
    summaryLabel = "No primary contact";
    summaryInteractive = true;
  }

  return {
    contactCount,
    hasContacts,
    hasPrimaryContact,
    contactWarningType,
    primaryContact,
    summaryLabel,
    summaryInteractive,
  };
}

type QualityInput = Pick<
  CrmOrganisationListRow,
  | "contact_count"
  | "primary_contact_id"
  | "primary_contact_name"
  | "primary_contact_role"
  | "primary_contact_email"
  | "primary_contact_phone"
  | "next_task_title"
  | "next_action_title"
  | "next_task_due"
  | "next_action_date"
  | "next_action_date_group"
  | "space_count"
  | "property_count"
  | "last_interaction_at"
>;

export function buildOrganisationQualityIndicators(
  row: QualityInput
): OrganisationQualityIndicator[] {
  const contactStatus = resolveOrganisationContactStatus(row);
  const items: OrganisationQualityIndicator[] = [];

  if (contactStatus.contactWarningType === "no_contacts") {
    items.push({ key: "no_contacts", label: "No contacts" });
  } else if (contactStatus.contactWarningType === "primary_required") {
    items.push({
      key: "primary_required",
      label: "Primary contact required",
    });
  }

  if (row.space_count === 0 && row.property_count === 0) {
    items.push({
      key: "no_properties",
      label: "No properties linked",
      action: "add_note",
    });
  } else if (row.property_count > 0 && row.space_count === 0) {
    items.push({ key: "no_spaces", label: "No spaces", action: "add_note" });
  }

  if (organisationHasContacts(row) && !organisationHasAnyEmail(row)) {
    items.push({ key: "no_email", label: "No email", action: "add_note" });
  }
  if (organisationHasContacts(row) && !organisationHasAnyPhone(row)) {
    items.push({ key: "no_phone", label: "No phone", action: "add_note" });
  }

  const actionTitle = row.next_action_title ?? row.next_task_title;
  const actionDate = row.next_action_date ?? row.next_task_due;
  const nextActionVisible = Boolean(actionTitle);
  const overdueInActionBlock =
    nextActionVisible &&
    actionDate &&
    isCrmTaskOverdue(actionDate, "open");

  if (!actionTitle) {
    items.push({
      key: "no_next",
      label: "No next step",
      action: "schedule_followup",
    });
  }
  if (actionTitle && !actionDate) {
    items.push({
      key: "no_follow_up",
      label: "No follow-up date",
      action: "schedule_followup",
    });
  }
  if (
    actionDate &&
    isCrmTaskOverdue(actionDate, "open") &&
    !overdueInActionBlock
  ) {
    items.push({ key: "overdue", label: "Overdue", action: "complete_task" });
  }
  if (!row.last_interaction_at) {
    items.push({
      key: "no_interaction",
      label: "No interaction",
      action: "log_call",
    });
  }

  return items;
}

export function patchOrganisationRowPrimaryContact(
  row: CrmOrganisationListRow,
  contact: {
    id: string;
    name: string;
    role?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null
): CrmOrganisationListRow {
  if (!contact) {
    return {
      ...row,
      primary_contact_id: null,
      primary_contact_name: null,
      primary_contact_role: null,
      primary_contact_email: null,
      primary_contact_phone: null,
    };
  }
  return {
    ...row,
    primary_contact_id: contact.id,
    primary_contact_name: contact.name,
    primary_contact_role: contact.role ?? null,
    primary_contact_email: contact.email ?? null,
    primary_contact_phone: contact.phone ?? null,
    contact_count: Math.max(row.contact_count, 1),
  };
}
