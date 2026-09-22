import type { SupabaseClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import { maskAccountDisplay } from "@/lib/organisation-commercial-dto";
import { OrganisationCommercialError } from "@/lib/organisation-commercial-error";
import {
  loadOrganisationCommercialBundle,
} from "@/lib/organisation-commercial-server";
import { notifyOrganisationPayoutRecorded } from "@/lib/organisation-payout-notify";
import {
  isOrganisationBookingPayoutEligible,
  ORGANISATION_PAYOUT_AUDIT,
  organisationPayoutCanRecord,
  roundPayoutMoney,
  summariseOrganisationPayoutLedger,
  sumOrganisationPayoutItems,
  type OrganisationPayoutBundle,
  type OrganisationPayoutEligibleBooking,
  type OrganisationPayoutHistoryRow,
  type RecordOrganisationPayoutInput,
} from "@/lib/organisation-payout";

function mapPayoutRpcError(message: string): OrganisationCommercialError {
  if (message.includes("organisation_payout_forbidden")) {
    return new OrganisationCommercialError(403, "Forbidden.", "forbidden");
  }
  if (message.includes("organisation_not_found")) {
    return new OrganisationCommercialError(404, "Organisation not found.", "not_found");
  }
  if (message.includes("organisation_payout_archived")) {
    return new OrganisationCommercialError(
      403,
      "This organisation is not available for payout.",
      "archived"
    );
  }
  if (message.includes("organisation_payout_unverified")) {
    return new OrganisationCommercialError(
      403,
      "The organisation must be verified before a payout can be recorded.",
      "unverified"
    );
  }
  if (
    message.includes("organisation_payout_bank_missing") ||
    message.includes("organisation_payout_bank_not_verified")
  ) {
    return new OrganisationCommercialError(
      403,
      "A verified current bank account is required before a payout can be recorded.",
      "bank_not_verified"
    );
  }
  if (message.includes("organisation_payout_reference_required")) {
    return new OrganisationCommercialError(
      400,
      "Enter the EFT/payment reference (2–80 characters).",
      "reference_required"
    );
  }
  if (message.includes("organisation_payout_paid_at_invalid")) {
    return new OrganisationCommercialError(
      400,
      "Paid date cannot be in the future or more than 30 days in the past.",
      "paid_at_invalid"
    );
  }
  if (message.includes("organisation_payout_bookings_required")) {
    return new OrganisationCommercialError(
      400,
      "Select at least one eligible booking.",
      "bookings_required"
    );
  }
  if (
    message.includes("organisation_payout_booking_ineligible") ||
    message.includes("organisation_payout_booking_conflict") ||
    message.includes("organisation_payout_totals_invalid") ||
    message.includes("duplicate key") ||
    message.includes("organisation_payout_items_booking_uidx")
  ) {
    return new OrganisationCommercialError(
      409,
      "One or more bookings are not eligible or were already included in a payout.",
      "booking_ineligible"
    );
  }
  return new OrganisationCommercialError(
    400,
    "Could not record payout.",
    "payout_failed"
  );
}

export async function listOrganisationPayoutEligibleBookings(
  admin: SupabaseClient,
  organisationId: string
): Promise<OrganisationPayoutEligibleBooking[]> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, space_id, status, payment_status, payout_status, payout_paid_at, total_price, platform_fee, owner_earnings, paid_at, created_at, commercial_beneficiary_type, commercial_beneficiary_organisation_id, renter_id"
    )
    .eq("commercial_beneficiary_type", "organisation")
    .eq("commercial_beneficiary_organisation_id", organisationId)
    .eq("payment_status", "paid")
    .in("status", ["paid_confirmed", "confirmed", "completed"])
    .eq("payout_status", "unpaid_to_owner")
    .order("paid_at", { ascending: true });

  if (error) {
    throw new OrganisationCommercialError(500, error.message, "load_failed");
  }

  const rows = (data || []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const bookingIds = rows.map((row) => row.id as string);
  const spaceIds = Array.from(
    new Set(rows.map((row) => row.space_id as string | null).filter((id): id is string => Boolean(id)))
  );
  const renterIds = Array.from(
    new Set(rows.map((row) => row.renter_id as string | null).filter((id): id is string => Boolean(id)))
  );

  const [{ data: itemRows }, { data: chargeRows }, { data: spaces }, { data: renters }] =
    await Promise.all([
      admin
        .from("organisation_payout_items")
        .select("booking_id")
        .in("booking_id", bookingIds),
      admin
        .from("booking_charges")
        .select("booking_id, status")
        .in("booking_id", bookingIds),
      spaceIds.length
        ? admin.from("spaces").select("id, title").in("id", spaceIds)
        : Promise.resolve({ data: [] as unknown[] }),
      renterIds.length
        ? admin.from("profiles").select("id, first_name, last_name, email").in("id", renterIds)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

  const paidOut = new Set(
    ((itemRows || []) as Array<{ booking_id: string }>).map((row) => row.booking_id)
  );
  const chargesByBooking = new Map<string, { pending: number; paid: number }>();
  for (const charge of (chargeRows || []) as Array<{ booking_id: string; status: string }>) {
    const current = chargesByBooking.get(charge.booking_id) || { pending: 0, paid: 0 };
    if (charge.status === "pending") current.pending += 1;
    if (charge.status === "paid") current.paid += 1;
    chargesByBooking.set(charge.booking_id, current);
  }
  const spaceTitle = new Map(
    ((spaces || []) as Array<{ id: string; title: string | null }>).map((row) => [
      row.id,
      row.title,
    ])
  );
  const renterLabel = new Map(
    (
      (renters || []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>
    ).map((row) => [
      row.id,
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        row.email ||
        null,
    ])
  );

  const eligible: OrganisationPayoutEligibleBooking[] = [];
  for (const row of rows) {
    const charges = chargesByBooking.get(row.id as string) || { pending: 0, paid: 0 };
    if (
      !isOrganisationBookingPayoutEligible({
        organisationId,
        booking: {
          id: row.id as string,
          commercial_beneficiary_type: row.commercial_beneficiary_type as string | null,
          commercial_beneficiary_organisation_id:
            row.commercial_beneficiary_organisation_id as string | null,
          status: row.status as string | null,
          payment_status: row.payment_status as string | null,
          payout_status: row.payout_status as string | null,
          payout_paid_at: row.payout_paid_at as string | null,
          total_price: roundPayoutMoney(row.total_price),
          platform_fee: roundPayoutMoney(row.platform_fee),
          owner_earnings: roundPayoutMoney(row.owner_earnings),
        },
        pendingChargeCount: charges.pending,
        paidChargeCount: charges.paid,
        alreadyInPayout: paidOut.has(row.id as string),
      })
    ) {
      continue;
    }

    eligible.push({
      id: row.id as string,
      space_id: (row.space_id as string | null) ?? null,
      space_title: row.space_id ? spaceTitle.get(row.space_id as string) || null : null,
      renter_label: row.renter_id
        ? renterLabel.get(row.renter_id as string) || null
        : null,
      status: row.status as string | null,
      payment_status: row.payment_status as string | null,
      payout_status: row.payout_status as string | null,
      total_price: roundPayoutMoney(row.total_price) as number,
      platform_fee: roundPayoutMoney(row.platform_fee) as number,
      owner_earnings: roundPayoutMoney(row.owner_earnings) as number,
      paid_at: (row.paid_at as string | null) ?? null,
      created_at: (row.created_at as string | null) ?? null,
    });
  }

  return eligible;
}

export async function listOrganisationPayoutHistory(
  admin: SupabaseClient,
  organisationId: string
): Promise<OrganisationPayoutHistoryRow[]> {
  const { data, error } = await admin
    .from("organisation_payouts")
    .select(
      "id, organisation_id, bank_account_id, status, currency, amount_gross, amount_platform_fee, amount_net, reference, notes, paid_at, paid_by"
    )
    .eq("organisation_id", organisationId)
    .order("paid_at", { ascending: false });

  if (error) {
    throw new OrganisationCommercialError(500, error.message, "load_failed");
  }

  const payouts = (data || []) as Array<Record<string, unknown>>;
  if (payouts.length === 0) return [];

  const payoutIds = payouts.map((row) => row.id as string);
  const bankIds = Array.from(
    new Set(payouts.map((row) => row.bank_account_id as string))
  );

  const [{ data: itemRows }, { data: banks }] = await Promise.all([
    admin
      .from("organisation_payout_items")
      .select("payout_id")
      .in("payout_id", payoutIds),
    admin
      .from("organisation_bank_accounts")
      .select(
        "id, version_number, bank_name, account_holder_name, account_number_last4"
      )
      .in("id", bankIds),
  ]);

  const counts = new Map<string, number>();
  for (const item of (itemRows || []) as Array<{ payout_id: string }>) {
    counts.set(item.payout_id, (counts.get(item.payout_id) || 0) + 1);
  }
  const bankMap = new Map(
    (
      (banks || []) as Array<{
        id: string;
        version_number: number;
        bank_name: string;
        account_holder_name: string;
        account_number_last4: string;
      }>
    ).map((row) => [row.id, row])
  );

  return payouts.map((row) => {
    const bank = bankMap.get(row.bank_account_id as string);
    const last4 = bank?.account_number_last4 ?? null;
    return {
      id: row.id as string,
      organisation_id: row.organisation_id as string,
      bank_account_id: row.bank_account_id as string,
      bank_version_number: bank?.version_number ?? null,
      bank_name: bank?.bank_name ?? null,
      account_holder_name: bank?.account_holder_name ?? null,
      account_number_last4: last4,
      account_number_display: maskAccountDisplay(last4),
      status: "paid" as const,
      currency: (row.currency as string) || "ZAR",
      amount_gross: roundPayoutMoney(row.amount_gross) as number,
      amount_platform_fee: roundPayoutMoney(row.amount_platform_fee) as number,
      amount_net: roundPayoutMoney(row.amount_net) as number,
      reference: row.reference as string,
      notes: (row.notes as string | null) ?? null,
      paid_at: row.paid_at as string,
      paid_by: (row.paid_by as string | null) ?? null,
      booking_count: counts.get(row.id as string) || 0,
    };
  });
}

export async function recordOrganisationPayout(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    actorUserId: string;
    fields: RecordOrganisationPayoutInput;
  }
): Promise<{
  payout: OrganisationPayoutHistoryRow;
  totals: { gross: number; fee: number; net: number };
}> {
  const bundle = await loadOrganisationCommercialBundle(admin, input.organisationId);
  if (
    !organisationPayoutCanRecord({
      organisationStatus: bundle.organisation.status,
      verificationStatus: bundle.commercial?.verification_status ?? null,
      currentBankStatus: bundle.bank?.status ?? null,
    })
  ) {
    throw new OrganisationCommercialError(
      403,
      bundle.payout_readiness.explanation,
      bundle.payout_readiness.code
    );
  }

  const eligible = await listOrganisationPayoutEligibleBookings(
    admin,
    input.organisationId
  );
  const eligibleIds = new Set(eligible.map((row) => row.id));
  for (const bookingId of input.fields.bookingIds) {
    if (!eligibleIds.has(bookingId)) {
      throw new OrganisationCommercialError(
        409,
        "One or more bookings are not eligible for this organisation payout.",
        "booking_ineligible"
      );
    }
  }

  const selected = eligible.filter((row) =>
    input.fields.bookingIds.includes(row.id)
  );
  const preview = sumOrganisationPayoutItems(
    selected.map((row) => ({
      gross: row.total_price,
      fee: row.platform_fee,
      net: row.owner_earnings,
    }))
  );

  const { data, error } = await admin.rpc("record_organisation_payout", {
    p_organisation_id: input.organisationId,
    p_actor_id: input.actorUserId,
    p_booking_ids: input.fields.bookingIds,
    p_reference: input.fields.reference,
    p_paid_at: input.fields.paidAt,
    p_notes: input.fields.notes,
  });

  if (error || !data) {
    throw mapPayoutRpcError(error?.message || "Could not record payout.");
  }

  const rpc = data as Record<string, unknown>;
  if ("account_number" in rpc) {
    delete rpc.account_number;
  }

  const payout: OrganisationPayoutHistoryRow = {
    id: rpc.id as string,
    organisation_id: rpc.organisation_id as string,
    bank_account_id: rpc.bank_account_id as string,
    bank_version_number: (rpc.bank_version_number as number | null) ?? null,
    bank_name: (rpc.bank_name as string | null) ?? null,
    account_holder_name: (rpc.account_holder_name as string | null) ?? null,
    account_number_last4: (rpc.account_number_last4 as string | null) ?? null,
    account_number_display: maskAccountDisplay(
      (rpc.account_number_last4 as string | null) ?? null
    ),
    status: "paid",
    currency: (rpc.currency as string) || "ZAR",
    amount_gross: roundPayoutMoney(rpc.amount_gross) as number,
    amount_platform_fee: roundPayoutMoney(rpc.amount_platform_fee) as number,
    amount_net: roundPayoutMoney(rpc.amount_net) as number,
    reference: rpc.reference as string,
    notes: (rpc.notes as string | null) ?? null,
    paid_at: rpc.paid_at as string,
    paid_by: (rpc.paid_by as string | null) ?? null,
    booking_count: Number(rpc.booking_count || selected.length),
  };

  await adminAudit({
    action: ORGANISATION_PAYOUT_AUDIT.recorded,
    actorUserId: input.actorUserId,
    targetType: "organisation_payout",
    targetId: payout.id,
    meta: {
      organisation_id: input.organisationId,
      payout_id: payout.id,
      booking_count: payout.booking_count,
      amount_gross: payout.amount_gross,
      amount_platform_fee: payout.amount_platform_fee,
      amount_net: payout.amount_net,
      bank_account_id: payout.bank_account_id,
      bank_version_number: payout.bank_version_number,
      reference: payout.reference,
      paid_at: payout.paid_at,
      actor_kind: "global_admin",
    },
  });

  await notifyOrganisationPayoutRecorded({
    admin,
    organisationId: input.organisationId,
    organisationName: bundle.organisation.name,
    amountNet: payout.amount_net,
    reference: payout.reference,
  });

  return { payout, totals: preview };
}

export async function loadOrganisationPayoutBundle(
  admin: SupabaseClient,
  organisationId: string
): Promise<OrganisationPayoutBundle> {
  const bundle = await loadOrganisationCommercialBundle(admin, organisationId);
  const [eligible, history] = await Promise.all([
    listOrganisationPayoutEligibleBookings(admin, organisationId),
    listOrganisationPayoutHistory(admin, organisationId),
  ]);
  const totals = summariseOrganisationPayoutLedger({ eligible, history });
  return {
    organisation: bundle.organisation,
    payout_readiness: bundle.payout_readiness,
    current_bank: bundle.bank,
    eligible,
    history,
    totals,
    can_record: organisationPayoutCanRecord({
      organisationStatus: bundle.organisation.status,
      verificationStatus: bundle.commercial?.verification_status ?? null,
      currentBankStatus: bundle.bank?.status ?? null,
    }),
  };
}
