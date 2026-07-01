"use client";

import { ExternalLink, FileText } from "lucide-react";
import {
  formatCustomFieldDisplayValue,
  type BookingRequirementResponseRow,
} from "@/lib/space-booking-requirement-fields";
import type { BookingTermsAcceptanceSnapshot } from "@/lib/property-booking-terms";

type Props = {
  terms?: BookingTermsAcceptanceSnapshot | null;
  responses?: BookingRequirementResponseRow[];
  title?: string;
  contactDetailsRedacted?: boolean;
};

function DetailSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e2e8f0] bg-[#fbfcfd] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">{heading}</h3>
      <div className="mt-2 text-sm text-[#192a3a]">{children}</div>
    </section>
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function BookingRequirementResponsesPanel({
  terms,
  responses = [],
  title = "Renter information",
  contactDetailsRedacted = false,
}: Props) {
  const hasTerms =
    terms &&
    (terms.terms_accepted ||
      terms.terms_accepted_at ||
      terms.accepted_terms_title ||
      terms.accepted_terms_label);
  const hasResponses = responses.length > 0;

  if (!hasTerms && !hasResponses) return null;

  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:p-5">
      <h2 className="mb-4 text-base font-semibold text-[#192a3a]">{title}</h2>

      {contactDetailsRedacted ? (
        <p className="mb-4 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-950">
          Some response details may be hidden until payment is confirmed. Renter contact
          details are only shared through FindMySpace at the approved booking stage.
        </p>
      ) : null}

      <div className="space-y-3">
        {hasTerms ? (
          <DetailSection heading="Property terms">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-gray-600">Terms accepted</dt>
                <dd className="font-medium">{terms?.terms_accepted ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Accepted at</dt>
                <dd className="font-medium">{formatDateTime(terms?.terms_accepted_at)}</dd>
              </div>
              {terms?.accepted_terms_title ? (
                <div className="sm:col-span-2">
                  <dt className="text-gray-600">Terms title</dt>
                  <dd className="font-medium">{terms.accepted_terms_title}</dd>
                </div>
              ) : null}
              {terms?.accepted_terms_label ? (
                <div className="sm:col-span-2">
                  <dt className="text-gray-600">Checkbox label</dt>
                  <dd className="font-medium">{terms.accepted_terms_label}</dd>
                </div>
              ) : null}
              {terms?.accepted_terms_updated_at ? (
                <div>
                  <dt className="text-gray-600">Terms version</dt>
                  <dd className="font-medium">{formatDateTime(terms.accepted_terms_updated_at)}</dd>
                </div>
              ) : null}
            </dl>
          </DetailSection>
        ) : null}

        {hasResponses
          ? responses.map((response) => {
              const fileHref =
                response.signed_file_url || response.file_url || null;
              return (
              <DetailSection key={response.id} heading={response.field_label_snapshot}>
                {response.field_type_snapshot === "file_upload" && fileHref ? (
                  <a
                    href={fileHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-[#192a3a] hover:underline"
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    View uploaded document
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : response.field_type_snapshot === "file_upload" ? (
                  <p className="text-sm text-gray-600">Document uploaded</p>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {formatCustomFieldDisplayValue(
                      response.field_type_snapshot,
                      response.value
                    )}
                  </p>
                )}
              </DetailSection>
            );
            })
          : null}
      </div>
    </div>
  );
}
