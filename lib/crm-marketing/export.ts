import type { CrmMarketingContactRow } from "./types";
import type { RecipientPreviewResult } from "./types";

export function buildMarketingContactsCsv(
  rows: Array<
    Pick<
      CrmMarketingContactRow,
      | "contact_name"
      | "organisation_name"
      | "role"
      | "email"
      | "status"
      | "consent_status"
      | "lawful_basis"
      | "lists"
      | "sendable"
      | "eligibility_reason"
    >
  >
): string {
  const headers = [
    "Contact name",
    "Organisation",
    "Role",
    "Email",
    "Marketing status",
    "Consent status",
    "Lawful basis",
    "Lists",
    "Sendable",
    "Exclusion reason",
  ];

  const escape = (value: string | null | undefined) => {
    const text = value ?? "";
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.contact_name,
        row.organisation_name,
        row.role,
        row.email,
        row.status,
        row.consent_status,
        row.lawful_basis,
        row.lists.join("; "),
        row.sendable ? "Yes" : "No",
        row.sendable ? "" : row.eligibility_reason,
      ]
        .map(escape)
        .join(",")
    ),
  ];

  return lines.join("\n");
}

export function previewRowsForCsv(preview: RecipientPreviewResult) {
  const eligibleRows = preview.eligible.map((row) => ({
    contact_name: row.contactName,
    organisation_name: row.organisationName,
    role: null,
    email: row.email,
    status: "eligible",
    consent_status: "",
    lawful_basis: "",
    lists: [],
    sendable: true,
    eligibility_reason: "",
  }));

  const excludedRows = preview.excluded.map((row) => ({
    contact_name: row.contactName,
    organisation_name: null,
    role: null,
    email: row.email,
    status: "excluded",
    consent_status: "",
    lawful_basis: "",
    lists: [],
    sendable: false,
    eligibility_reason: row.reason,
  }));

  return [...eligibleRows, ...excludedRows];
}
