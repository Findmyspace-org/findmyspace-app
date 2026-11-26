import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInitialBookingCharges } from "@/lib/invoice";
import { computeBookingTotals } from "@/lib/booking-pricing";
import { loadResolvedCommercialTerms } from "@/lib/commercial-terms-server";
import {
  legacyCombinedCommercialTerms,
  snapshotBookingCommercialInsert,
  stripForbiddenClientCommercialKeys,
} from "@/lib/commercial-terms";
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
import { publicAvailabilityMessage } from "@/lib/availability/messages";
import { resolveFlexibleBooking, type EnabledFlexibleRate } from "@/lib/flexible-booking";
import { isFlexiblePeriod } from "@/lib/booking-periods";
import type { ResolvedCommercialTerms } from "@/lib/commercial-terms";
import { calculateBookingCommercials } from "@/lib/commercial-calculator";
import { validatePayFastPayableAmount } from "@/lib/payfast-amount";
import {
  resolveServerRecurringQuote,
  type RecurringRequestInput,
} from "@/lib/recurring-booking-server";
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
  /**
   * Flexible-rate selections. Prices and enabled periods are loaded from
   * the database. These fields are ignored when the space has no rates.
   */
  ratePeriod?: string | null;
  quantity?: number | null;
  startDate?: string | null;
  /**
   * Recurring schedule. The server regenerates every session and price.
   * Client totals and occurrence lists are ignored.
   */
  recurring?: RecurringRequestInput | null;
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

async function loadEnabledFlexibleRates(
  admin: SupabaseClient,
  spaceId: string
): Promise<EnabledFlexibleRate[]> {
  const { data, error } = await admin
    .from("space_booking_rates")
    .select("period, amount, enabled")
    .eq("space_id", spaceId)
    .eq("enabled", true);
  if (error) {
    const message = String(error.message || "");
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /space_booking_rates/i.test(message)
    ) {
      return [];
    }
    throw new Error("Could not load booking options.");
  }
  return (data ?? []).flatMap((row) => {
    const period = String(row.period || "");
    const amount = Number(row.amount);
    if (!isFlexiblePeriod(period) || !(amount > 0)) return [];
    return [{ period, amount }];
  });
}

function flexibleTotals(totalPrice: number, terms: ResolvedCommercialTerms) {
  const commercialSplit = calculateBookingCommercials(totalPrice, {
    model: terms.model,
    commissionPercent: terms.commissionPercent,
    transactionFeePercent: terms.transactionFeePercent,
    accountingMode: terms.accountingMode,
  });
  return {
    unitPrice: totalPrice,
    quantity: 1,
    totalPrice,
    depositAmount: 0,
    monthlyRent: 0,
    initialPaymentAmount: totalPrice,
    nextPaymentDate: null as string | null,
    monthsTotal: 0,
    monthsPaid: 0,
    platformFee: commercialSplit.totalFindmyspaceFee,
    ownerAmount: commercialSplit.hostEarnings,
    commercialSplit,
    commercialTerms: terms,
  };
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
  } = stripForbiddenClientCommercialKeys(
    payload as BookingRequestPayload & Record<string, unknown>
  ) as BookingRequestPayload;

  if (!spaceId || (!payload.recurring && (!startAt || !endAt))) {
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

  const flexibleRates = await loadEnabledFlexibleRates(admin, spaceId);
  let unit = bookingUnit || space.booking_unit || "day";
  let quantity = 0;
  let resolvedStart = startAt;
  let resolvedEnd = endAt;
  let flexibleSnapshot: {
    pricing_mode: "flexible" | "recurring";
    rate_period: string;
    unit_price: number;
    billed_quantity: number;
    totalPrice: number;
  } | null = null;
  let recurringAttach: RecurringRequestInput | null = null;

  if (payload.recurring) {
    const resolved = await resolveServerRecurringQuote(admin, spaceId, payload.recurring);
    if (resolved.conflicts.length > 0) {
      throw new Error(
        `These sessions are not available: ${resolved.conflicts.slice(0, 8).join(", ")}. Exclude a session or change the schedule.`
      );
    }
    const included = resolved.quote.sessions.filter((session) => !session.excluded);
    unit = "recurring_hour";
    quantity = resolved.quote.totalHours;
    resolvedStart = included[0].start.toISOString();
    resolvedEnd = included[included.length - 1].end.toISOString();
    flexibleSnapshot = {
      pricing_mode: "recurring",
      rate_period: "hour",
      unit_price: resolved.quote.hourlyRate,
      billed_quantity: resolved.quote.totalHours,
      totalPrice: resolved.quote.rentalSubtotal,
    };
    recurringAttach = {
      frequency: resolved.quote.pattern.frequency,
      weekdays: resolved.quote.pattern.frequency === "daily" ? [] : resolved.quote.pattern.weekdays,
      localStart: resolved.quote.pattern.localStart,
      localEnd: resolved.quote.pattern.localEnd,
      startsOn: resolved.quote.pattern.startsOn,
      endsOn: resolved.quote.pattern.endsOn,
      excludedDates: resolved.quote.pattern.excludedDates,
    };
  } else if (flexibleRates.length > 0) {
    const resolved = resolveFlexibleBooking({
      rates: flexibleRates,
      ratePeriod: payload.ratePeriod,
      quantity: payload.quantity,
      startDate: payload.startDate,
      startAt,
      endAt,
    });
    if (!resolved.ok) {
      throw new Error(resolved.error);
    }
    unit = resolved.quote.storedBookingUnit;
    quantity = resolved.quote.quantity;
    resolvedStart = resolved.quote.startAt;
    resolvedEnd = resolved.quote.endAt;
    flexibleSnapshot = {
      pricing_mode: "flexible",
      rate_period: resolved.quote.period,
      unit_price: resolved.quote.unitPrice,
      billed_quantity: resolved.quote.quantity,
      totalPrice: resolved.quote.totalPrice,
    };
  } else if (payload.ratePeriod) {
    throw new Error("This listing does not offer that booking period.");
  } else {
    quantity = calculateBookingQuantity(unit, startAt, endAt);
  }

  if (quantity <= 0) {
    throw new Error("Please choose a valid booking period.");
  }

  const minimum = flexibleSnapshot ? 0 : getMinimumQuantity(space, unit);
  if (minimum > 0 && quantity < minimum) {
    throw new Error("This booking does not meet the minimum duration.");
  }

  const commercialLockedAt = new Date();
  let commercialTerms = legacyCombinedCommercialTerms(space.platform_fee_percent);
  try {
    commercialTerms = await loadResolvedCommercialTerms(admin, {
      organisationId,
      propertyId: space.property_id,
      spaceId: space.id,
      effectiveAt: commercialLockedAt,
      legacySpacePercent: space.platform_fee_percent,
    });
  } catch (err) {
    console.error("commercial terms resolve failed; using legacy combined fee", err);
  }

  const totals = flexibleSnapshot
    ? flexibleTotals(flexibleSnapshot.totalPrice, commercialTerms)
    : computeBookingTotals(space, unit, quantity, resolvedStart, commercialTerms);
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
    commercialSplit,
  } = totals;

  const payable = validatePayFastPayableAmount(totalPrice);
  if (!payable.ok) {
    throw new Error(payable.error);
  }

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
    start_at: resolvedStart,
    end_at: resolvedEnd,
    ...(flexibleSnapshot
      ? {
          pricing_mode: flexibleSnapshot.pricing_mode,
          rate_period: flexibleSnapshot.rate_period,
          unit_price: flexibleSnapshot.unit_price,
          billed_quantity: flexibleSnapshot.billed_quantity,
          ...(flexibleSnapshot.pricing_mode === "recurring"
            ? { reserves_via_occurrences: true }
            : {}),
        }
      : {}),
    total_price: totalPrice,
    platform_fee: platformFee,
    owner_earnings: ownerAmount,
    ...snapshotBookingCommercialInsert(
      commercialSplit,
      totals.commercialTerms,
      commercialLockedAt
    ),
    status: "pending_owner",
    payment_status: "unpaid",
    payout_status: "unpaid_to_owner",
    notes: notes?.trim() ? notes.trim() : null,
    monthly_rent: !flexibleSnapshot && unit === "month" ? monthlyRent : null,
    deposit_amount: !flexibleSnapshot && unit === "month" ? depositAmount : null,
    initial_payment_amount:
      !flexibleSnapshot && unit === "month" ? initialPaymentAmount : null,
    next_payment_date: !flexibleSnapshot && unit === "month" ? nextPaymentDate : null,
    months_total: !flexibleSnapshot && unit === "month" ? monthsTotal : null,
    months_paid: !flexibleSnapshot && unit === "month" ? monthsPaid : null,
    ...termsPayload,
  };

  const { data: insertedBooking, error: insertError } = await admin
    .from("bookings")
    .insert(insertRow)
    .select("id")
    .single();

  if (insertError || !insertedBooking) {
    throw new Error(
      publicAvailabilityMessage(insertError?.message || "Could not create booking.")
    );
  }

  const bookingId = (insertedBooking as { id: string }).id;

  try {
    if (recurringAttach) {
      const { error: seriesError } = await admin.rpc("attach_recurring_series", {
        p_booking_id: bookingId,
        p_frequency: recurringAttach.frequency,
        p_weekdays: recurringAttach.weekdays ?? [],
        p_local_start: recurringAttach.localStart,
        p_local_end: recurringAttach.localEnd,
        p_starts_on: recurringAttach.startsOn,
        p_ends_on: recurringAttach.endsOn,
        p_excluded: recurringAttach.excludedDates ?? [],
      });
      if (seriesError) {
        throw new Error(
          publicAvailabilityMessage(seriesError.message || "Could not save the recurring sessions.")
        );
      }
    }

    const chargeRows = buildInitialBookingCharges({
      bookingId,
      bookingUnit: unit,
      totalPrice,
      monthlyRent: !flexibleSnapshot && unit === "month" ? monthlyRent : undefined,
      depositAmount: !flexibleSnapshot && unit === "month" ? depositAmount : undefined,
      startAt: resolvedStart,
      endAt: resolvedEnd,
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
