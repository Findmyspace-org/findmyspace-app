import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInitialBookingCharges } from "@/lib/invoice";
import {
  computeBookingTotals,
  resolveBookingUnitPrice,
} from "@/lib/booking-pricing";
import { bookableSpaceError } from "@/lib/listing-lifecycle";
import { snapshotBookingOwnership } from "@/lib/access/operational-booking-managers";
import { resolveOperationalBookingManagers } from "@/lib/access/resolve-operational-booking-managers";
import {
  NO_COMMERCIAL_BENEFICIARY_ERROR,
  resolveCommercialBeneficiary,
  snapshotBookingBeneficiary,
} from "@/lib/access/commercial-beneficiary";
import { resolveOrganisationBookingReadiness } from "@/lib/access/organisation-booking-readiness";
import { isLegacyOwnerSelfBooking } from "@/lib/booking-self-booking";
import { isArchivedProperty } from "@/lib/property-archive";
import {
  buildBookingTermsAcceptancePayload,
  normalizePropertyTermsRow,
  propertyRequiresTermsAcceptance,
  type PropertyBookingTerms,
} from "@/lib/property-booking-terms";
import {
  buildBookingRequirementFilePath,
  uploadBookingRequirementFile,
  validateBookingRequirementUploadFile,
} from "@/lib/booking-requirement-storage";
import {
  normalizeSpaceBookingFieldRow,
  sortBookingFields,
  validateCustomFieldAnswersServer,
  type CustomFieldAnswerValue,
  type SpaceBookingRequirementField,
} from "@/lib/space-booking-requirement-fields";

export type BookingRequestPayload = {
  spaceId: string;
  /** Ignored for authority. Snapshot owner comes from the space. */
  ownerId?: string | null;
  bookingUnit: string;
  startAt: string;
  endAt: string;
  notes?: string | null;
  acceptedPropertyTerms: boolean;
  requirementAnswers?: Record<string, CustomFieldAnswerValue>;
  /** Ignored. Snapshot organisation comes from the property. */
  organisationId?: string | null;
};

type SpacePricingRow = {
  id: string;
  owner_id: string | null;
  status: string | null;
  public_listing_mode: string | null;
  is_bookable: boolean | null;
  property_id: string | null;
  booking_unit: string | null;
  price_amount: number | null;
  price_unit: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  platform_fee_percent: number | null;
  deposit_type: string | null;
  deposit_months: number | null;
  monthly_payment_day: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
};

export function calculateBookingQuantity(
  bookingUnit: string,
  startAt: string,
  endAt: string
): number {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;

  if (bookingUnit === "hour") {
    return Math.max(0.5, diffMs / (1000 * 60 * 60));
  }

  if (bookingUnit === "month") {
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonthExclusive = new Date(end.getFullYear(), end.getMonth(), 1);
    return Math.max(
      1,
      (endMonthExclusive.getFullYear() - startMonth.getFullYear()) * 12 +
        (endMonthExclusive.getMonth() - startMonth.getMonth())
    );
  }

  const days = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(days));
}

function getMinimumQuantity(space: SpacePricingRow, bookingUnit: string): number {
  if (bookingUnit === "hour") return Number(space.min_booking_hours || 0);
  if (bookingUnit === "month") return Number(space.min_booking_months || 0);
  return Number(space.min_booking_days || 0);
}

export async function loadSpaceBookingPrerequisites(
  admin: SupabaseClient,
  spaceId: string
): Promise<{
  propertyTerms: PropertyBookingTerms | null;
  fields: SpaceBookingRequirementField[];
}> {
  let propertyTerms: PropertyBookingTerms | null = null;

  const { data: space } = await admin
    .from("spaces")
    .select("property_id")
    .eq("id", spaceId)
    .maybeSingle();

  const propertyId = (space as { property_id: string | null } | null)?.property_id;
  if (propertyId) {
    const { data: property } = await admin
      .from("properties")
      .select(
        "id, terms_title, terms_text, terms_document_url, require_terms_acceptance, terms_acceptance_label, terms_updated_at"
      )
      .eq("id", propertyId)
      .maybeSingle();

    if (property) {
      propertyTerms = normalizePropertyTermsRow(property as Record<string, unknown>);
      if (propertyTerms) propertyTerms.property_id = propertyId;
    }
  }

  const { data: fieldRows } = await admin
    .from("space_booking_requirement_fields")
    .select(
      "id, space_id, label, help_text, field_type, required, options, sort_order, active"
    )
    .eq("space_id", spaceId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const fields = sortBookingFields(
    ((fieldRows || []) as Record<string, unknown>[]).map(normalizeSpaceBookingFieldRow)
  );

  return { propertyTerms, fields };
}

export async function createBookingRequestServer(
  admin: SupabaseClient,
  renterId: string,
  payload: BookingRequestPayload,
  filesByFieldId: Map<string, File>
): Promise<{ bookingId: string }> {
  const {
    spaceId,
    bookingUnit,
    startAt,
    endAt,
    notes,
    acceptedPropertyTerms,
    requirementAnswers = {},
  } = payload;

  if (!spaceId || !startAt || !endAt) {
    throw new Error("Missing required booking fields.");
  }

  const { data: spaceRow, error: spaceErr } = await admin
    .from("spaces")
    .select(
      "id, owner_id, status, public_listing_mode, is_bookable, property_id, booking_unit, price_amount, price_unit, price_per_hour, price_per_day, price_per_month, platform_fee_percent, deposit_type, deposit_months, monthly_payment_day, min_booking_hours, min_booking_days, min_booking_months"
    )
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceErr || !spaceRow) {
    throw new Error("Space not found.");
  }

  const space = spaceRow as SpacePricingRow;

  const bookableError = bookableSpaceError(space);
  if (bookableError) {
    throw new Error(bookableError);
  }

  if (isLegacyOwnerSelfBooking(space.owner_id, renterId)) {
    throw new Error("You cannot book your own listing.");
  }

  let organisationId: string | null = null;
  if (space.property_id) {
    const { data: property } = await admin
      .from("properties")
      .select("organisation_id, archived_at")
      .eq("id", space.property_id)
      .maybeSingle();
    const propertyRow = property as {
      organisation_id: string | null;
      archived_at: string | null;
    } | null;

    if (isArchivedProperty(propertyRow)) {
      throw new Error("This property is no longer available for booking.");
    }

    organisationId = propertyRow?.organisation_id ?? null;
  }

  const beneficiary = resolveCommercialBeneficiary({
    propertyOrganisationId: organisationId,
    spaceOwnerId: space.owner_id,
  });

  if (beneficiary.type === "none") {
    throw new Error(NO_COMMERCIAL_BENEFICIARY_ERROR);
  }

  if (organisationId) {
    const { data: organisation } = await admin
      .from("organisations")
      .select("id, status, archived_at")
      .eq("id", organisationId)
      .maybeSingle();
    const orgRow = organisation as {
      id: string;
      status: string | null;
      archived_at: string | null;
    } | null;

    const { data: commercial } = await admin
      .from("organisation_commercial_profiles")
      .select("verification_status")
      .eq("organisation_id", organisationId)
      .maybeSingle();

    const readiness = resolveOrganisationBookingReadiness({
      organisationId,
      organisationStatus: orgRow?.status ?? null,
      organisationArchivedAt: orgRow?.archived_at ?? null,
      verificationStatus:
        (commercial as { verification_status?: string } | null)
          ?.verification_status ?? null,
      commercialProfileExists: Boolean(commercial),
      beneficiary,
    });
    if (!readiness.ok) {
      throw new Error(readiness.message);
    }
  }

  const operational = await resolveOperationalBookingManagers(admin, spaceId);
  if (!operational?.canAcceptPublicBooking) {
    throw new Error(
      "This listing cannot accept bookings because no host is assigned to manage requests."
    );
  }

  const snapshot = snapshotBookingOwnership({
    spaceOwnerId: space.owner_id,
    organisationId,
  });
  const beneficiarySnapshot = snapshotBookingBeneficiary(beneficiary);

  const unit = bookingUnit || space.booking_unit || "day";
  const quantity = calculateBookingQuantity(unit, startAt, endAt);
  if (quantity <= 0) {
    throw new Error("Please choose a valid booking period.");
  }

  const minimum = getMinimumQuantity(space, unit);
  if (minimum > 0 && quantity < minimum) {
    throw new Error("This booking does not meet the minimum duration.");
  }

  const totals = computeBookingTotals(space, unit, quantity, startAt);
  if (!totals) {
    throw new Error("This listing does not have valid pricing yet.");
  }

  const {
    totalPrice,
    depositAmount,
    monthlyRent,
    initialPaymentAmount,
    nextPaymentDate,
    monthsTotal,
    monthsPaid,
    platformFee,
    ownerAmount,
  } = totals;

  const { propertyTerms, fields } = await loadSpaceBookingPrerequisites(admin, spaceId);
  const requiresPropertyTerms = propertyRequiresTermsAcceptance(propertyTerms);

  if (requiresPropertyTerms && !acceptedPropertyTerms) {
    throw new Error("Please accept the property terms and conditions before booking.");
  }

  const uploadedFieldIds = new Set(filesByFieldId.keys());
  const validationError = validateCustomFieldAnswersServer(
    fields,
    requirementAnswers,
    uploadedFieldIds,
    filesByFieldId
  );
  if (validationError) {
    throw new Error(validationError);
  }

  const termsPayload =
    requiresPropertyTerms && propertyTerms
      ? buildBookingTermsAcceptancePayload(propertyTerms, true)
      : {};

  const insertRow = {
    space_id: spaceId,
    renter_id: renterId,
    owner_id: snapshot.ownerId,
    organisation_id: snapshot.organisationId,
    commercial_beneficiary_type: beneficiarySnapshot.commercial_beneficiary_type,
    commercial_beneficiary_user_id:
      beneficiarySnapshot.commercial_beneficiary_user_id,
    commercial_beneficiary_organisation_id:
      beneficiarySnapshot.commercial_beneficiary_organisation_id,
    booking_unit: unit,
    start_at: startAt,
    end_at: endAt,
    total_price: totalPrice,
    platform_fee: platformFee,
    owner_earnings: ownerAmount,
    status: "pending_owner",
    payment_status: "unpaid",
    payout_status: "unpaid_to_owner",
    notes: notes?.trim() ? notes.trim() : null,
    monthly_rent: unit === "month" ? monthlyRent : null,
    deposit_amount: unit === "month" ? depositAmount : null,
    initial_payment_amount: unit === "month" ? initialPaymentAmount : null,
    next_payment_date: unit === "month" ? nextPaymentDate : null,
    months_total: unit === "month" ? monthsTotal : null,
    months_paid: unit === "month" ? monthsPaid : null,
    ...termsPayload,
  };

  const { data: insertedBooking, error: insertError } = await admin
    .from("bookings")
    .insert(insertRow)
    .select("id")
    .single();

  if (insertError || !insertedBooking) {
    throw new Error(insertError?.message || "Could not create booking.");
  }

  const bookingId = (insertedBooking as { id: string }).id;

  try {
    const chargeRows = buildInitialBookingCharges({
      bookingId,
      bookingUnit: unit,
      totalPrice,
      monthlyRent: unit === "month" ? monthlyRent : undefined,
      depositAmount: unit === "month" ? depositAmount : undefined,
      startAt,
      endAt,
    });

    if (chargeRows.length > 0) {
      const { error: chargesError } = await admin.from("booking_charges").insert(chargeRows);
      if (chargesError) throw chargesError;
    }

    const responseRows: Record<string, unknown>[] = [];

    for (const field of fields) {
      let filePath: string | null = null;
      let value: CustomFieldAnswerValue = requirementAnswers[field.id] ?? null;

      if (field.field_type === "file_upload") {
        const file = filesByFieldId.get(field.id);
        if (!file) {
          if (!field.required) continue;
          throw new Error(`Missing upload for "${field.label}".`);
        }

        const validation = validateBookingRequirementUploadFile(file);
        if (!validation.ok) {
          throw new Error(validation.error);
        }

        const path = buildBookingRequirementFilePath(renterId, bookingId, field.id, file.name);
        const buffer = Buffer.from(await file.arrayBuffer());
        await uploadBookingRequirementFile(admin, path, buffer, file.type);
        filePath = path;
        value = { file_name: file.name };
      } else if (!field.required) {
        const empty =
          value === null ||
          value === undefined ||
          (typeof value === "string" && value.trim() === "") ||
          (Array.isArray(value) && value.length === 0);
        if (empty) continue;
      }

      responseRows.push({
        booking_id: bookingId,
        space_id: spaceId,
        field_id: field.id,
        field_label_snapshot: field.label,
        field_type_snapshot: field.field_type,
        value,
        file_url: null,
        file_path: filePath,
      });
    }

    if (responseRows.length > 0) {
      const { error: responsesError } = await admin
        .from("booking_requirement_responses")
        .insert(responseRows);
      if (responsesError) throw responsesError;
    }

    return { bookingId };
  } catch (err) {
    await admin.from("bookings").delete().eq("id", bookingId);
    throw err;
  }
}
