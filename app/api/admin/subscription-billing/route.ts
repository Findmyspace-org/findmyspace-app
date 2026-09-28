import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  SubscriptionBillingError,
  findmyspaceBillingBankStatus,
  subscriptionInvoiceReadiness,
} from "@/lib/subscription-billing";
import { updateOrganisationCommercialProfile } from "@/lib/organisation-commercial-server";
import {
  createEligibleSubscriptionPeriodsForMonth,
  createSubscriptionPeriodForMonth,
  issueSubscriptionInvoice,
  listSubscriptionPeriods,
  loadSubscriptionRevenueSummary,
  previewSubscriptionPeriodsForMonth,
  recordSubscriptionPayment,
  sendSubscriptionPaymentEmail,
  voidSubscriptionInvoice,
} from "@/lib/subscription-billing-server";

function jsonError(err: unknown) {
  if (err instanceof SubscriptionBillingError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const raw = err instanceof Error ? err.message : "Subscription billing failed.";
  const message = /duplicate key|violates unique|sqlstate/i.test(raw)
    ? "Could not save subscription billing."
    : raw;
  const status = /not found/i.test(message) ? 404 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;
  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const previewMonth = searchParams.get("previewMonth");
  try {
    if (previewMonth) {
      const items = await previewSubscriptionPeriodsForMonth(admin, previewMonth);
      const eft = findmyspaceBillingBankStatus();
      return NextResponse.json({
        billingMonth: previewMonth,
        items: items.map((row) => ({
          ...row,
          readiness: subscriptionInvoiceReadiness({
            termsResolved:
              Boolean(row.snapshot?.commercialTermsId) && row.skipReason !== "unresolved",
            amountResolved: row.eligible,
            billedPartyResolved: Boolean(row.billedOrganisationId || row.billedScopeId),
            monthlyAmount: row.monthlyAmount,
            hasBillingEmail: Boolean(row.billingEmail),
            eftConfigured: eft.configured,
          }),
        })),
        eligible: items.filter((row) => row.eligible),
        skipped: items.filter((row) => !row.eligible),
        billingSetup: { eft },
      });
    }
    const paymentRaw = searchParams.get("paymentStatus");
    const [periods, revenue] = await Promise.all([
      listSubscriptionPeriods(admin, {
        billingMonth: searchParams.get("month"),
        organisationId: searchParams.get("organisationId"),
        paymentStatus:
          paymentRaw === "paid" || paymentRaw === "unpaid" ? paymentRaw : null,
      }),
      loadSubscriptionRevenueSummary(admin),
    ]);
    const eft = findmyspaceBillingBankStatus();
    return NextResponse.json({
      periods,
      revenue,
      billingSetup: {
        eft,
        issueBlockedReason: eft.configured
          ? null
          : `EFT details missing: ${eft.missing.join(", ")}.`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;
  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";

  try {
    if (action === "preview") {
      const billingMonth = String(body?.billing_month || "");
      const items = await previewSubscriptionPeriodsForMonth(admin, billingMonth);
      const eft = findmyspaceBillingBankStatus();
      return NextResponse.json({
        billingMonth,
        items: items.map((row) => ({
          ...row,
          readiness: subscriptionInvoiceReadiness({
            termsResolved: Boolean(row.snapshot?.commercialTermsId) && row.skipReason !== "unresolved",
            amountResolved: row.eligible,
            billedPartyResolved: Boolean(row.billedOrganisationId || row.billedScopeId),
            monthlyAmount: row.monthlyAmount,
            hasBillingEmail: Boolean(row.billingEmail),
            eftConfigured: eft.configured,
          }),
        })),
        eligible: items.filter((row) => row.eligible),
        skipped: items.filter((row) => !row.eligible),
        billingSetup: { eft },
      });
    }

    if (action === "create_month") {
      const result = await createEligibleSubscriptionPeriodsForMonth(
        admin,
        String(body?.billing_month || "")
      );
      await adminAudit({
        action: "subscription_periods_generated",
        actorUserId: auth.userId,
        targetType: "subscription_billing_month",
        targetId: result.billingMonth,
        meta: {
          created: result.created.length,
          existing: result.existing.length,
          skipped: result.skipped.length,
        },
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "create_period") {
      const created = await createSubscriptionPeriodForMonth(admin, {
        billingMonth: String(body?.billing_month || ""),
        organisationId: (body?.organisation_id as string | null) ?? null,
        propertyId: (body?.property_id as string | null) ?? null,
        spaceId: (body?.space_id as string | null) ?? null,
      });
      await adminAudit({
        action: "subscription_period_created",
        actorUserId: auth.userId,
        targetType: "commercial_subscription_periods",
        targetId: created.period.id,
        meta: {
          created: created.created,
          billing_month: created.period.billing_month,
          monthly_amount: created.period.monthly_amount,
        },
      });
      return NextResponse.json({ ok: true, ...created });
    }

    if (action === "save_billing_contact") {
      const organisationId = String(body?.organisation_id || "");
      const commercial = await updateOrganisationCommercialProfile(admin, {
        organisationId,
        actorUserId: auth.userId,
        isGlobalAdmin: true,
        body: {
          billing_contact_name: body?.billing_contact_name,
          billing_email: body?.billing_email,
          billing_phone: body?.billing_phone,
        },
      });
      await adminAudit({
        action: "subscription_billing_contact_saved",
        actorUserId: auth.userId,
        targetType: "organisation_commercial_profiles",
        targetId: organisationId,
        meta: {
          has_email: Boolean(commercial.billing_email),
        },
      });
      return NextResponse.json({ ok: true, commercial });
    }

    if (action === "issue") {
      const issued = await issueSubscriptionInvoice(
        admin,
        String(body?.period_id || ""),
        auth.userId,
        {
          dueDate: (body?.due_date as string | null) ?? null,
          sendEmail: body?.send_email !== false,
          sendTestInvoiceEmail: body?.send_test_invoice_email === true,
          allowIncompletePaymentInstructions: body?.allow_incomplete_payment_instructions === true,
        }
      );
      await adminAudit({
        action: "subscription_invoice_issued",
        actorUserId: auth.userId,
        targetType: "commercial_subscription_periods",
        targetId: issued.period.id,
        meta: {
          invoice_number: issued.period.invoice_number,
          email_sent: issued.emailSent,
          is_test_invoice: issued.period.is_test_invoice,
        },
      });
      return NextResponse.json({ ok: true, ...issued });
    }

    if (action === "record_payment") {
      const period = await recordSubscriptionPayment(
        admin,
        String(body?.period_id || ""),
        auth.userId,
        {
          paidAt: (body?.paid_at as string | null) ?? null,
          amountPaid:
            typeof body?.amount_paid === "number" ? body.amount_paid : null,
          paymentReference: String(body?.payment_reference || ""),
          paymentNote: (body?.payment_note as string | null) ?? null,
        }
      );
      if (body?.send_email !== false) {
        await sendSubscriptionPaymentEmail(period);
      }
      await adminAudit({
        action: "subscription_payment_recorded",
        actorUserId: auth.userId,
        targetType: "commercial_subscription_periods",
        targetId: period.id,
        meta: { invoice_number: period.invoice_number },
      });
      return NextResponse.json({ ok: true, period });
    }

    if (action === "void") {
      const period = await voidSubscriptionInvoice(
        admin,
        String(body?.period_id || ""),
        auth.userId,
        (body?.reason as string | null) ?? null
      );
      await adminAudit({
        action: "subscription_invoice_voided",
        actorUserId: auth.userId,
        targetType: "commercial_subscription_periods",
        targetId: period.id,
        meta: { invoice_number: period.invoice_number, void_reason: period.void_reason },
      });
      return NextResponse.json({ ok: true, period });
    }

    return NextResponse.json({ error: "Unknown subscription billing action." }, { status: 400 });
  } catch (err) {
    return jsonError(err);
  }
}
