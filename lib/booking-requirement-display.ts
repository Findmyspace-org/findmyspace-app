import { isCommunicationAllowed } from "@/lib/booking-communication";
import { sanitizeRequirementResponseValue } from "@/lib/contact-info-guard";
import type { BookingRequirementAccess } from "@/lib/booking-requirement-access";
import type { BookingRequirementResponseRow } from "@/lib/space-booking-requirement-fields";

export function contactDetailsAllowedForRequirementViewer(
  booking: { status: string | null; payment_status: string | null },
  access: BookingRequirementAccess
): boolean {
  if (access === "renter") return true;
  return isCommunicationAllowed(booking);
}

export function sanitizeRequirementResponsesForViewer(
  responses: BookingRequirementResponseRow[],
  allowContactDetails: boolean
): BookingRequirementResponseRow[] {
  if (allowContactDetails) return responses;

  return responses.map((response) => {
    const sanitizedValue = sanitizeRequirementResponseValue(
      response.field_type_snapshot,
      response.value,
      false
    );

    const hideFileLink =
      response.field_type_snapshot === "file_upload" &&
      JSON.stringify(sanitizedValue) !== JSON.stringify(response.value);

    return {
      ...response,
      value: sanitizedValue,
      signed_file_url: hideFileLink ? null : response.signed_file_url,
      file_url: hideFileLink ? null : response.file_url,
    };
  });
}
