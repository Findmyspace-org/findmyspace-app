/**
 * Read-only preview of subscription billing for a month.
 * Does not insert periods or issue invoices.
 *
 * Usage: npx tsx --env-file=.env.local scripts/preview-subscription-billing-month.ts 2026-10
 */
import { createClient } from "@supabase/supabase-js";
import { previewSubscriptionPeriodsForMonth } from "../lib/subscription-billing-server";

async function main() {
  const month = process.argv[2] || "2026-10";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env.");
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const items = await previewSubscriptionPeriodsForMonth(admin, month);
  const eligible = items.filter((row) => row.eligible);
  const warnings = items.filter((row) => !row.eligible);
  console.log(
    JSON.stringify(
      {
        billingMonth: month,
        eligibleCount: eligible.length,
        warningCount: warnings.length,
        eligible: eligible.map((row) => ({
          billedPartyName: row.billedPartyName,
          billedOrganisationId: row.billedOrganisationId,
          commercialModel: row.commercialModel,
          pricingMode: row.pricingMode,
          inventoryCount: row.inventoryCount,
          monthlyAmount: row.monthlyAmount,
          calculationText: row.snapshot?.calculationText ?? null,
          termsId: row.snapshot?.commercialTermsId ?? null,
          termsEffectiveFrom: row.snapshot?.commercialTermsEffectiveFrom ?? null,
        })),
        warnings: warnings.map((row) => ({
          billedPartyName: row.billedPartyName,
          skipReason: row.skipReason,
          warning: row.warning,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
