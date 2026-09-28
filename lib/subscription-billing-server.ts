import type { SupabaseClient } from "@supabase/supabase-js";
import { isBillableOrganisation } from "@/lib/commercial-inventory";
import { subscriptionBilledScope } from "@/lib/commercial-subscription";
import {
  formatCommercialArrangement,
  resolveCommercialTerms,
  withSubscriptionResolution,
  type CommercialTermRow,
  type ResolvedCommercialTerms,
} from "@/lib/commercial-terms";
import {
  loadBillableInventoryCounts,
  loadCommercialTermRows,
} from "@/lib/commercial-terms-server";
import { sendEmail } from "@/lib/email";
import {
  SubscriptionBillingError,
  buildSubscriptionCalculationSnapshot,
  canIssueSubscriptionInvoice,
  canRecordSubscriptionPayment,
  canVoidSubscriptionInvoice,
  evaluateSubscriptionEligibility,
  parseBillingMonthInput,
  billingMonthEffectiveAt,
  skipReasonMessage,
  summariseSubscriptionRevenue,
  johannesburgCalendarDate,
  findmyspaceBillingBankStatus,
  TEST_INVOICE_BANNER,
  resolveSubscriptionDueDate,
  subscriptionIssueIsTestInvoice,
  shouldSendSubscriptionInvoiceEmail,
  type SubscriptionCalculationSnapshot,
  type SubscriptionPeriodPreview,
  type SubscriptionPeriodRow,
} from "@/lib/subscription-billing";
import { roundMoney } from "@/lib/commercial-calculator";
import {
  commercialTiersToProgressiveBands,
  isProgressivePricingMode,
  isPropertyCountPricingMode,
} from "@/lib/commercial-subscription";
import { progressiveBandGapWarning } from "@/lib/commercial-progressive-pricing";

const PERIOD_COLUMNS =
  "id, billing_month, scope_type, scope_id, billed_organisation_id, billed_party_name, commercial_terms_id, pricing_mode, inventory_count, matched_tier_id, matched_tier_label, monthly_amount, status, payment_status, invoice_number, invoice_date, due_date, paid_at, amount_paid, payment_reference, payment_note, payment_recorded_by, calculation_snapshot, billing_email, email_sent_at, issued_by, is_test_invoice, voided_at, voided_by, void_reason, created_at";

type OrgRow = {
  id: string;
  name: string | null;
  status: string | null;
  archived_at: string | null;
};

type PropertyRow = {
  id: string;
  organisation_id: string | null;
  name: string | null;
  archived_at: string | null;
};

type SpaceRow = {
  id: string;
  property_id: string | null;
  title: string | null;
};

function asPeriod(row: Record<string, unknown>): SubscriptionPeriodRow {
  return {
    id: String(row.id),
    billing_month: String(row.billing_month).slice(0, 10),
    scope_type: row.scope_type as SubscriptionPeriodRow["scope_type"],
    scope_id: String(row.scope_id),
    billed_organisation_id: (row.billed_organisation_id as string | null) ?? null,
    billed_party_name: (row.billed_party_name as string | null) ?? null,
    commercial_terms_id: (row.commercial_terms_id as string | null) ?? null,
    pricing_mode: (row.pricing_mode as SubscriptionPeriodRow["pricing_mode"]) ?? null,
    inventory_count: Number(row.inventory_count || 0),
    matched_tier_id: (row.matched_tier_id as string | null) ?? null,
    matched_tier_label: (row.matched_tier_label as string | null) ?? null,
    monthly_amount: Number(row.monthly_amount || 0),
    status: row.status as SubscriptionPeriodRow["status"],
    payment_status: (row.payment_status as SubscriptionPeriodRow["payment_status"]) || "unpaid",
    invoice_number: (row.invoice_number as string | null) ?? null,
    invoice_date: row.invoice_date ? String(row.invoice_date).slice(0, 10) : null,
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : null,
    paid_at: (row.paid_at as string | null) ?? null,
    amount_paid: row.amount_paid == null ? null : Number(row.amount_paid),
    payment_reference: (row.payment_reference as string | null) ?? null,
    payment_note: (row.payment_note as string | null) ?? null,
    payment_recorded_by: (row.payment_recorded_by as string | null) ?? null,
    calculation_snapshot:
      (row.calculation_snapshot as SubscriptionCalculationSnapshot | null) ?? null,
    billing_email: (row.billing_email as string | null) ?? null,
    email_sent_at: (row.email_sent_at as string | null) ?? null,
    issued_by: (row.issued_by as string | null) ?? null,
    is_test_invoice: Boolean(row.is_test_invoice),
    voided_at: (row.voided_at as string | null) ?? null,
    voided_by: (row.voided_by as string | null) ?? null,
    void_reason: (row.void_reason as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function uniqueKey(scopeType: string, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

async function loadBillingLookups(admin: SupabaseClient): Promise<{
  organisations: OrgRow[];
  properties: PropertyRow[];
  spaces: SpaceRow[];
  terms: CommercialTermRow[];
  emails: Map<string, string | null>;
  billingContacts: Map<
    string,
    { name: string | null; email: string | null; phone: string | null }
  >;
}> {
  const [
    { data: orgData, error: orgError },
    { data: propertyData, error: propertyError },
    { data: spaceData, error: spaceError },
    { data: emailData, error: emailError },
  ] = await Promise.all([
    admin.from("organisations").select("id, name, status, archived_at"),
    admin.from("properties").select("id, organisation_id, name, archived_at"),
    admin.from("spaces").select("id, property_id, title"),
    admin
      .from("organisation_commercial_profiles")
      .select(
        "organisation_id, billing_email, primary_contact_email, billing_contact_name, billing_phone"
      ),
  ]);
  if (orgError) throw new Error(orgError.message || "Could not load organisations.");
  if (propertyError) throw new Error(propertyError.message || "Could not load properties.");
  if (spaceError) throw new Error(spaceError.message || "Could not load spaces.");
  let profileRows: unknown[] | null = emailData;
  if (emailError) {
    const fallback = await admin
      .from("organisation_commercial_profiles")
      .select("organisation_id, primary_contact_email");
    if (fallback.error) {
      throw new Error(emailError.message || "Could not load billing contacts.");
    }
    profileRows = fallback.data;
  }

  const organisations = (orgData || []) as OrgRow[];
  const properties = (propertyData || []) as PropertyRow[];
  const spaces = (spaceData || []) as SpaceRow[];
  const terms = await loadCommercialTermRows(admin, {
    organisationIds: organisations.map((row) => row.id),
    propertyIds: properties.map((row) => row.id),
    spaceIds: spaces.map((row) => row.id),
  });
  const emails = new Map<string, string | null>();
  const billingContacts = new Map<
    string,
    { name: string | null; email: string | null; phone: string | null }
  >();
  for (const row of (profileRows || []) as Array<{
    organisation_id: string;
    billing_email?: string | null;
    primary_contact_email: string | null;
    billing_contact_name?: string | null;
    billing_phone?: string | null;
  }>) {
    const email = row.billing_email?.trim() || row.primary_contact_email?.trim() || null;
    emails.set(row.organisation_id, email);
    billingContacts.set(row.organisation_id, {
      name: row.billing_contact_name?.trim() || null,
      email,
      phone: row.billing_phone?.trim() || null,
    });
  }
  return { organisations, properties, spaces, terms, emails, billingContacts };
}

function billedOrganisationIdForScope(
  billed: { scopeType: "organisation" | "property" | "space"; scopeId: string },
  properties: PropertyRow[],
  spaces: SpaceRow[]
): string | null {
  if (billed.scopeType === "organisation") return billed.scopeId;
  if (billed.scopeType === "property") {
    return properties.find((row) => row.id === billed.scopeId)?.organisation_id ?? null;
  }
  const propertyId = spaces.find((row) => row.id === billed.scopeId)?.property_id ?? null;
  if (!propertyId) return null;
  return properties.find((row) => row.id === propertyId)?.organisation_id ?? null;
}

function partyNameForScope(
  billed: { scopeType: "organisation" | "property" | "space"; scopeId: string },
  organisations: OrgRow[],
  properties: PropertyRow[],
  spaces: SpaceRow[]
): string {
  if (billed.scopeType === "organisation") {
    return organisations.find((row) => row.id === billed.scopeId)?.name || "Organisation";
  }
  if (billed.scopeType === "property") {
    const property = properties.find((row) => row.id === billed.scopeId);
    const orgName = organisations.find((row) => row.id === property?.organisation_id)?.name;
    return property?.name
      ? orgName
        ? `${property.name} · ${orgName}`
        : property.name
      : "Property";
  }
  const space = spaces.find((row) => row.id === billed.scopeId);
  return space?.title || "Space";
}

async function previewResolvedScope(input: {
  admin: SupabaseClient;
  billingMonth: string;
  effectiveAt: Date;
  organisationId?: string | null;
  propertyId?: string | null;
  spaceId?: string | null;
  rows: CommercialTermRow[];
  organisations: OrgRow[];
  properties: PropertyRow[];
  spaces: SpaceRow[];
}): Promise<SubscriptionPeriodPreview | null> {
  const resolvedBase = resolveCommercialTerms({
    organisationId: input.organisationId,
    propertyId: input.propertyId,
    spaceId: input.spaceId,
    effectiveAt: input.effectiveAt,
    rows: input.rows,
  });
  const billed = subscriptionBilledScope({
    source: resolvedBase.source,
    organisationId: input.organisationId,
    propertyId: input.propertyId,
    spaceId: input.spaceId,
  });
  const inventory = billed
    ? await loadBillableInventoryCounts(input.admin, billed)
    : null;
  const resolved = withSubscriptionResolution(resolvedBase, {
    organisationId: input.organisationId,
    propertyId: input.propertyId,
    spaceId: input.spaceId,
    inventory,
  });
  return toPreview({
    billingMonth: input.billingMonth,
    resolved,
    billed,
    organisations: input.organisations,
    properties: input.properties,
    spaces: input.spaces,
  });
}

function toPreview(input: {
  billingMonth: string;
  resolved: ResolvedCommercialTerms;
  billed: { scopeType: "organisation" | "property" | "space"; scopeId: string } | null;
  organisations: OrgRow[];
  properties: PropertyRow[];
  spaces: SpaceRow[];
}): SubscriptionPeriodPreview | null {
  if (!input.billed) {
    if (input.resolved.model !== "subscription") return null;
    return {
      billingMonth: input.billingMonth,
      billedScopeType: "organisation",
      billedScopeId: "",
      billedOrganisationId: null,
      billedOrganisationName: null,
      billedPartyName: "Unknown",
      commercialModel: input.resolved.model,
      pricingMode: input.resolved.subscriptionPricingMode,
      inventoryCount: 0,
      monthlyAmount: 0,
      eligible: false,
      skipReason: "no_billed_scope",
      unresolvedReason: input.resolved.subscription?.unresolvedReason ?? null,
      warning: skipReasonMessage("no_billed_scope"),
      billingEmail: null,
      coverageWarning: null,
      snapshot: null,
    };
  }

  const billedOrganisationId = billedOrganisationIdForScope(
    input.billed,
    input.properties,
    input.spaces
  );
  const billedOrganisationName =
    billedOrganisationId
      ? input.organisations.find((row) => row.id === billedOrganisationId)?.name || null
      : null;
  const billedPartyName = partyNameForScope(
    input.billed,
    input.organisations,
    input.properties,
    input.spaces
  );
  const eligibility = evaluateSubscriptionEligibility({
    model: input.resolved.model,
    billedScope: input.billed,
    resolution: input.resolved.subscription,
  });
  const skipReason = eligibility.eligible ? null : eligibility.reason;
  const snapshot =
    eligibility.eligible && input.resolved.subscription
      ? buildSubscriptionCalculationSnapshot({
          billingMonth: input.billingMonth,
          billedScope: input.billed,
          billedOrganisationId,
          billedOrganisationName,
          billedPartyName,
          termsId: input.resolved.termsId,
          termsEffectiveFrom: input.resolved.effectiveFrom,
          includedUnits: input.resolved.subscriptionIncludedUnits,
          baseAmount: input.resolved.subscriptionBaseAmount,
          arrangementSummary: formatCommercialArrangement(input.resolved),
          resolution: input.resolved.subscription,
        })
      : null;

  const coverageWarning =
    eligibility.eligible &&
    isProgressivePricingMode(input.resolved.subscriptionPricingMode)
      ? progressiveBandGapWarning(
          input.resolved.subscriptionIncludedUnits ?? 0,
          commercialTiersToProgressiveBands(input.resolved.tiers),
          isPropertyCountPricingMode(input.resolved.subscriptionPricingMode)
            ? "property"
            : "space"
        )
      : null;

  return {
    billingMonth: input.billingMonth,
    billedScopeType: input.billed.scopeType,
    billedScopeId: input.billed.scopeId,
    billedOrganisationId,
    billedOrganisationName,
    billedPartyName,
    commercialModel: input.resolved.model,
    pricingMode: input.resolved.subscriptionPricingMode,
    inventoryCount: input.resolved.subscription?.inventoryCount ?? 0,
    monthlyAmount: input.resolved.subscription?.monthlyAmount ?? 0,
    eligible: eligibility.eligible,
    skipReason,
    unresolvedReason: input.resolved.subscription?.unresolvedReason ?? null,
    warning: skipReason
      ? skipReason === "unresolved"
        ? `Pricing gap or unresolved schedule: ${input.resolved.subscription?.unresolvedReason || "unresolved"}`
        : skipReasonMessage(skipReason)
      : coverageWarning,
    billingEmail: null,
    coverageWarning,
    snapshot,
  };
}

export async function previewSubscriptionPeriodsForMonth(
  admin: SupabaseClient,
  billingMonthInput: string
): Promise<SubscriptionPeriodPreview[]> {
  const billingMonth = parseBillingMonthInput(billingMonthInput);
  const effectiveAt = billingMonthEffectiveAt(billingMonth);
  const lookups = await loadBillingLookups(admin);
  const previews: SubscriptionPeriodPreview[] = [];
  const seen = new Set<string>();

  const push = (preview: SubscriptionPeriodPreview | null) => {
    if (!preview || !preview.billedScopeId) return;
    const key = uniqueKey(preview.billedScopeType, preview.billedScopeId);
    if (seen.has(key)) return;
    seen.add(key);
    previews.push(preview);
  };

  for (const organisation of lookups.organisations) {
    if (!isBillableOrganisation(organisation)) continue;
    push(
      await previewResolvedScope({
        admin,
        billingMonth,
        effectiveAt,
        organisationId: organisation.id,
        rows: lookups.terms,
        organisations: lookups.organisations,
        properties: lookups.properties,
        spaces: lookups.spaces,
      })
    );
  }

  for (const property of lookups.properties) {
    const hasOverride = lookups.terms.some(
      (row) =>
        row.scope_type === "property" &&
        row.scope_id === property.id &&
        row.commercial_model === "subscription"
    );
    if (!hasOverride) continue;
    push(
      await previewResolvedScope({
        admin,
        billingMonth,
        effectiveAt,
        organisationId: property.organisation_id,
        propertyId: property.id,
        rows: lookups.terms,
        organisations: lookups.organisations,
        properties: lookups.properties,
        spaces: lookups.spaces,
      })
    );
  }

  for (const space of lookups.spaces) {
    const hasOverride = lookups.terms.some(
      (row) =>
        row.scope_type === "space" &&
        row.scope_id === space.id &&
        row.commercial_model === "subscription"
    );
    if (!hasOverride) continue;
    const property = lookups.properties.find((row) => row.id === space.property_id);
    push(
      await previewResolvedScope({
        admin,
        billingMonth,
        effectiveAt,
        organisationId: property?.organisation_id,
        propertyId: property?.id,
        spaceId: space.id,
        rows: lookups.terms,
        organisations: lookups.organisations,
        properties: lookups.properties,
        spaces: lookups.spaces,
      })
    );
  }

  return previews
    .filter(
      (row) =>
        row.eligible ||
        row.skipReason === "unresolved" ||
        row.skipReason === "zero_inventory" ||
        row.skipReason === "zero_amount"
    )
    .map((row) => ({
      ...row,
      billingEmail: row.billedOrganisationId
        ? lookups.emails.get(row.billedOrganisationId) || null
        : null,
    }))
    .sort((a, b) => a.billedPartyName.localeCompare(b.billedPartyName, "en"));
}

export async function createSubscriptionPeriodForMonth(
  admin: SupabaseClient,
  input: {
    billingMonth: string;
    organisationId?: string | null;
    propertyId?: string | null;
    spaceId?: string | null;
  }
): Promise<{ created: boolean; period: SubscriptionPeriodRow; preview: SubscriptionPeriodPreview }> {
  const billingMonth = parseBillingMonthInput(input.billingMonth);
  const effectiveAt = billingMonthEffectiveAt(billingMonth);
  const lookups = await loadBillingLookups(admin);
  const preview = await previewResolvedScope({
    admin,
    billingMonth,
    effectiveAt,
    organisationId: input.organisationId,
    propertyId: input.propertyId,
    spaceId: input.spaceId,
    rows: lookups.terms,
    organisations: lookups.organisations,
    properties: lookups.properties,
    spaces: lookups.spaces,
  });
  if (!preview) {
    throw new SubscriptionBillingError(
      "No billed party for this scope.",
      "no_billed_scope"
    );
  }
  if (preview.billedOrganisationId) {
    preview.billingEmail = lookups.emails.get(preview.billedOrganisationId) || null;
  }
  if (preview.skipReason === "unresolved") {
    throw new SubscriptionBillingError(
      preview.warning || "Pricing is unresolved for this billing month.",
      "subscription_period_unresolved",
      409
    );
  }
  if (!preview.eligible || !preview.snapshot) {
    throw new SubscriptionBillingError(
      preview.warning || "This arrangement is not eligible for a subscription period.",
      preview.skipReason || "not_eligible"
    );
  }

  const existing = await findPeriod(admin, {
    scopeType: preview.billedScopeType,
    scopeId: preview.billedScopeId,
    billingMonth,
  });
  if (existing) {
    return { created: false, period: existing, preview };
  }

  const { data, error } = await admin
    .from("commercial_subscription_periods")
    .insert({
      billing_month: billingMonth,
      scope_type: preview.billedScopeType,
      scope_id: preview.billedScopeId,
      billed_organisation_id: preview.billedOrganisationId,
      billed_party_name: preview.billedPartyName,
      commercial_terms_id: preview.snapshot.commercialTermsId,
      pricing_mode: preview.pricingMode,
      inventory_count: preview.inventoryCount,
      matched_tier_id: preview.snapshot.matchedTierId,
      matched_tier_label: preview.snapshot.matchedTierLabel,
      monthly_amount: preview.snapshot.monthlyAmount,
      status: "open",
      payment_status: "unpaid",
      calculation_snapshot: preview.snapshot,
      billing_email: preview.billedOrganisationId
        ? lookups.emails.get(preview.billedOrganisationId) || null
        : null,
    })
    .select(PERIOD_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505" || /duplicate key/i.test(error.message || "")) {
      const raced = await findPeriod(admin, {
        scopeType: preview.billedScopeType,
        scopeId: preview.billedScopeId,
        billingMonth,
      });
      if (raced) return { created: false, period: raced, preview };
    }
    throw new Error(error.message || "Could not create subscription period.");
  }

  return { created: true, period: asPeriod(data as Record<string, unknown>), preview };
}

async function findPeriod(
  admin: SupabaseClient,
  input: { scopeType: string; scopeId: string; billingMonth: string }
): Promise<SubscriptionPeriodRow | null> {
  const { data, error } = await admin
    .from("commercial_subscription_periods")
    .select(PERIOD_COLUMNS)
    .eq("scope_type", input.scopeType)
    .eq("scope_id", input.scopeId)
    .eq("billing_month", input.billingMonth)
    .neq("status", "void")
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Could not load subscription period.");
  }
  return data ? asPeriod(data as Record<string, unknown>) : null;
}

export async function listSubscriptionPeriods(
  admin: SupabaseClient,
  filters: {
    billingMonth?: string | null;
    organisationId?: string | null;
    paymentStatus?: "paid" | "unpaid" | null;
  }
): Promise<SubscriptionPeriodRow[]> {
  let query = admin
    .from("commercial_subscription_periods")
    .select(PERIOD_COLUMNS)
    .order("billing_month", { ascending: false })
    .limit(500);
  if (filters.billingMonth) {
    query = query.eq("billing_month", parseBillingMonthInput(filters.billingMonth));
  }
  if (filters.organisationId) {
    query = query.eq("billed_organisation_id", filters.organisationId);
  }
  if (filters.paymentStatus) {
    query = query.eq("payment_status", filters.paymentStatus);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message || "Could not load subscription periods.");
  return ((data || []) as Record<string, unknown>[]).map(asPeriod);
}

export async function getSubscriptionPeriod(
  admin: SupabaseClient,
  periodId: string
): Promise<SubscriptionPeriodRow> {
  const { data, error } = await admin
    .from("commercial_subscription_periods")
    .select(PERIOD_COLUMNS)
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not load subscription period.");
  if (!data) {
    throw new SubscriptionBillingError("Subscription period not found.", "not_found", 404);
  }
  return asPeriod(data as Record<string, unknown>);
}

export async function createEligibleSubscriptionPeriodsForMonth(
  admin: SupabaseClient,
  billingMonthInput: string
): Promise<{
  billingMonth: string;
  created: SubscriptionPeriodRow[];
  existing: SubscriptionPeriodRow[];
  skipped: SubscriptionPeriodPreview[];
}> {
  const billingMonth = parseBillingMonthInput(billingMonthInput);
  const previews = await previewSubscriptionPeriodsForMonth(admin, billingMonth);
  const created: SubscriptionPeriodRow[] = [];
  const existing: SubscriptionPeriodRow[] = [];
  const skipped = previews.filter((row) => !row.eligible);
  for (const preview of previews.filter((row) => row.eligible)) {
    const result = await createSubscriptionPeriodForMonth(admin, {
      billingMonth,
      organisationId:
        preview.billedScopeType === "organisation"
          ? preview.billedScopeId
          : preview.billedOrganisationId,
      propertyId: preview.billedScopeType === "property" ? preview.billedScopeId : null,
      spaceId: preview.billedScopeType === "space" ? preview.billedScopeId : null,
    });
    if (result.created) created.push(result.period);
    else existing.push(result.period);
  }
  return { billingMonth, created, existing, skipped };
}

export async function issueSubscriptionInvoice(
  admin: SupabaseClient,
  periodId: string,
  actorUserId: string,
  input: {
    dueDate?: string | null;
    sendEmail?: boolean;
    sendTestInvoiceEmail?: boolean;
    allowIncompletePaymentInstructions?: boolean;
  } = {}
): Promise<{ period: SubscriptionPeriodRow; emailSent: boolean; emailWarning: string | null }> {
  const period = await getSubscriptionPeriod(admin, periodId);
  const allowed = canIssueSubscriptionInvoice(period);
  if (!allowed.ok) {
    throw new SubscriptionBillingError(allowed.error, "cannot_issue");
  }
  const eft = findmyspaceBillingBankStatus();
  const isTestInvoice = subscriptionIssueIsTestInvoice({
    eftConfigured: eft.configured,
    allowIncompletePaymentInstructions: input.allowIncompletePaymentInstructions,
  });
  if (!eft.configured && !isTestInvoice) {
    throw new SubscriptionBillingError(
      `Payment instructions are incomplete (${eft.missing.join(", ")}). Configure FindMySpace EFT details before issuing a payable invoice.`,
      "eft_incomplete",
      409
    );
  }

  const today = johannesburgCalendarDate();
  const dueDate = resolveSubscriptionDueDate(today, input.dueDate);
  const year = Number(today.slice(0, 4));
  const { data: numberData, error: numberError } = await admin.rpc(
    "next_subscription_invoice_number",
    { p_year: year }
  );
  if (numberError || !numberData) {
    throw new Error(numberError?.message || "Could not allocate invoice number.");
  }
  const invoiceNumber = String(numberData);

  const { data, error } = await admin
    .from("commercial_subscription_periods")
    .update({
      status: "invoiced",
      invoice_number: invoiceNumber,
      invoice_date: today,
      due_date: dueDate,
      issued_by: actorUserId,
      is_test_invoice: isTestInvoice,
    })
    .eq("id", periodId)
    .eq("status", period.status)
    .select(PERIOD_COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Could not issue subscription invoice.");
  }

  let issued = asPeriod(data as Record<string, unknown>);
  let emailSent = false;
  let emailWarning: string | null = null;
  const shouldEmail = shouldSendSubscriptionInvoiceEmail({
    isTestInvoice: issued.is_test_invoice,
    sendEmail: input.sendEmail,
    sendTestInvoiceEmail: input.sendTestInvoiceEmail,
  });
  if (issued.is_test_invoice && input.sendTestInvoiceEmail !== true) {
    emailWarning = "Test invoice was not emailed. No payment is required.";
  }
  if (shouldEmail) {
    if (!issued.billing_email) {
      emailWarning = issued.is_test_invoice
        ? "Test invoice was not emailed. No billing email configured."
        : "No billing email configured.";
    } else {
      const sent = await sendSubscriptionInvoiceEmail(issued);
      emailSent = sent.ok;
      if (!sent.ok) emailWarning = "Invoice issued, but the email could not be sent.";
      if (sent.ok) {
        const { data: emailed } = await admin
          .from("commercial_subscription_periods")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", periodId)
          .select(PERIOD_COLUMNS)
          .single();
        if (emailed) issued = asPeriod(emailed as Record<string, unknown>);
      }
    }
  }
  return { period: issued, emailSent, emailWarning };
}

export async function recordSubscriptionPayment(
  admin: SupabaseClient,
  periodId: string,
  actorUserId: string,
  input: {
    paidAt?: string | null;
    amountPaid?: number | null;
    paymentReference: string;
    paymentNote?: string | null;
  }
): Promise<SubscriptionPeriodRow> {
  const period = await getSubscriptionPeriod(admin, periodId);
  const allowed = canRecordSubscriptionPayment(period);
  if (!allowed.ok) {
    throw new SubscriptionBillingError(allowed.error, "cannot_record_payment");
  }
  const reference = String(input.paymentReference || "").trim();
  if (reference.length < 2 || reference.length > 80) {
    throw new SubscriptionBillingError(
      "Enter a payment reference between 2 and 80 characters.",
      "invalid_payment_reference"
    );
  }
  const amountPaid =
    input.amountPaid == null ? period.monthly_amount : Number(input.amountPaid);
  if (roundMoney(amountPaid) !== roundMoney(period.monthly_amount)) {
    throw new SubscriptionBillingError(
      "Payment amount must equal the invoiced monthly subscription.",
      "payment_amount_mismatch"
    );
  }

  const { data, error } = await admin
    .from("commercial_subscription_periods")
    .update({
      payment_status: "paid",
      paid_at: input.paidAt || new Date().toISOString(),
      amount_paid: roundMoney(amountPaid),
      payment_reference: reference,
      payment_note: input.paymentNote?.trim() || null,
      payment_recorded_by: actorUserId,
    })
    .eq("id", periodId)
    .eq("payment_status", "unpaid")
    .select(PERIOD_COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Could not record subscription payment.");
  }
  return asPeriod(data as Record<string, unknown>);
}

export async function voidSubscriptionInvoice(
  admin: SupabaseClient,
  periodId: string,
  actorUserId: string,
  reason?: string | null
): Promise<SubscriptionPeriodRow> {
  const period = await getSubscriptionPeriod(admin, periodId);
  const allowed = canVoidSubscriptionInvoice(period);
  if (!allowed.ok) {
    throw new SubscriptionBillingError(allowed.error, "cannot_void");
  }
  const voidReason = reason?.trim() || "";
  if (voidReason.length < 3) {
    throw new SubscriptionBillingError(
      "Enter a void reason of at least 3 characters.",
      "void_reason_required"
    );
  }
  const { data, error } = await admin
    .from("commercial_subscription_periods")
    .update({
      status: "void",
      voided_at: new Date().toISOString(),
      voided_by: actorUserId,
      void_reason: voidReason,
    })
    .eq("id", periodId)
    .select(PERIOD_COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Could not void subscription invoice.");
  }
  return asPeriod(data as Record<string, unknown>);
}

export async function loadSubscriptionRevenueSummary(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("commercial_subscription_periods")
    .select("status, payment_status, monthly_amount, is_test_invoice")
    .limit(2000);
  if (error) throw new Error(error.message || "Could not load subscription revenue.");
  return summariseSubscriptionRevenue(
    ((data || []) as Array<{
      status: SubscriptionPeriodRow["status"];
      payment_status: SubscriptionPeriodRow["payment_status"];
      monthly_amount: number;
      is_test_invoice?: boolean;
    }>).map((row) => ({
      status: row.status,
      payment_status: row.payment_status,
      monthly_amount: Number(row.monthly_amount || 0),
      is_test_invoice: Boolean(row.is_test_invoice),
    }))
  );
}

async function sendSubscriptionInvoiceEmail(
  period: SubscriptionPeriodRow
): Promise<{ ok: boolean }> {
  if (process.env.NODE_ENV === "test") return { ok: true };
  if (!period.billing_email || !period.invoice_number) return { ok: false };
  const snapshot = period.calculation_snapshot;
  const month = snapshot?.billingMonth || period.billing_month;
  const isTest = period.is_test_invoice;
  const subject = isTest
    ? `TEST — NOT FOR PAYMENT: FindMySpace subscription invoice ${period.invoice_number}`
    : `FindMySpace subscription invoice ${period.invoice_number}`;
  const html = isTest
    ? `<p><strong>${TEST_INVOICE_BANNER}</strong></p>
<p>This invoice was generated for billing workflow testing. No payment is required. Do not pay this invoice.</p>
<p>Invoice number: <strong>${period.invoice_number}</strong><br />
Billing month: ${month}<br />
Amount: R ${Number(period.monthly_amount).toFixed(2)} (not payable)<br />
Due date: ${period.due_date || "—"}</p>`
    : `<p>Your FindMySpace subscription invoice is ready.</p>
<p>Invoice number: <strong>${period.invoice_number}</strong><br />
Billing month: ${month}<br />
Amount due: R ${Number(period.monthly_amount).toFixed(2)}<br />
Due date: ${period.due_date || "—"}</p>
<p>Download the invoice from your organisation billing page. Transaction fees are not included in this invoice.</p>`;
  return sendEmail({
    to: period.billing_email,
    subject,
    html,
  });
}

export async function sendSubscriptionPaymentEmail(
  period: SubscriptionPeriodRow
): Promise<{ ok: boolean }> {
  if (process.env.NODE_ENV === "test") return { ok: true };
  if (!period.billing_email || !period.invoice_number) return { ok: false };
  return sendEmail({
    to: period.billing_email,
    subject: `Payment recorded for ${period.invoice_number}`,
    html: `<p>We have recorded payment for subscription invoice <strong>${period.invoice_number}</strong>.</p>
<p>Amount: R ${Number(period.amount_paid ?? period.monthly_amount).toFixed(2)}<br />
Reference: ${period.payment_reference || "—"}</p>`,
  });
}

