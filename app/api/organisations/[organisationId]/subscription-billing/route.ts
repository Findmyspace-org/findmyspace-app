import { NextRequest, NextResponse } from "next/server";
import { requireOrgCommercialApi } from "@/lib/access/require-org-commercial-api";
import { listSubscriptionPeriods } from "@/lib/subscription-billing-server";
import { loadResolvedCommercialTerms } from "@/lib/commercial-terms-server";
import { toHostCommercialArrangementDto } from "@/lib/host-commercial-copy";
import { organisationCanSeeSubscriptionInvoice } from "@/lib/subscription-billing";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await context.params;
  const auth = await requireOrgCommercialApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const [periods, terms] = await Promise.all([
      listSubscriptionPeriods(auth.admin, { organisationId }),
      loadResolvedCommercialTerms(auth.admin, { organisationId }),
    ]);
    const visible = periods.filter(organisationCanSeeSubscriptionInvoice);
    return NextResponse.json({
      organisationId,
      arrangement: toHostCommercialArrangementDto(terms),
      estimate: {
        monthlyAmount: terms.subscription?.monthlyAmount ?? 0,
        unresolved: Boolean(terms.subscription?.unresolvedReason),
        inventoryCount: terms.subscription?.inventoryCount ?? 0,
        pricingMode: terms.subscriptionPricingMode,
      },
      invoices: visible.map((row) => ({
        id: row.id,
        billingMonth: row.billing_month,
        invoiceNumber: row.invoice_number,
        invoiceDate: row.invoice_date,
        dueDate: row.due_date,
        monthlyAmount: row.monthly_amount,
        status: row.status,
        paymentStatus: row.payment_status,
        paidAt: row.paid_at,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load subscription billing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
