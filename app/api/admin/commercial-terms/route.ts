import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  formatCommercialArrangement,
  inheritedFromLabel,
  resolveCommercialTerms,
  withSubscriptionResolution,
  type CommercialScopeType,
} from "@/lib/commercial-terms";
import { subscriptionBilledScope } from "@/lib/commercial-subscription";
import { buildCommercialPrecedencePath } from "@/lib/commercial-admin-display";
import {
  createCommercialTerms,
  loadBillableInventoryCounts,
  loadCommercialTermRows,
  resolveListingScopeIds,
} from "@/lib/commercial-terms-server";

function viewScope(input: {
  organisationId?: string | null;
  propertyId?: string | null;
  spaceId?: string | null;
}): CommercialScopeType {
  if (input.spaceId) return "space";
  if (input.propertyId) return "property";
  if (input.organisationId) return "organisation";
  return "platform";
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const searchParams = req.nextUrl.searchParams;
  const listAll = searchParams.get("list") === "all";
  const organisationId = searchParams.get("organisationId");
  const propertyId = searchParams.get("propertyId");
  const spaceId = searchParams.get("spaceId");
  const effectiveAt = searchParams.get("effectiveAt") || new Date().toISOString();

  try {
    if (listAll) {
      const { data, error } = await admin
        .from("commercial_terms")
        .select(
          "id, scope_type, scope_id, commercial_model, commission_percent, transaction_fee_percent, monthly_subscription_amount, subscription_pricing_mode, effective_from, superseded_at, admin_note, created_by, created_at"
        )
        .order("effective_from", { ascending: false })
        .limit(300);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ terms: data || [] });
    }

    const scope = await resolveListingScopeIds(admin, {
      organisationId,
      propertyId,
      spaceId,
    });
    const rows = await loadCommercialTermRows(admin, scope);
    const resolvedBase = resolveCommercialTerms({
      ...scope,
      effectiveAt,
      rows,
      legacySpacePercent: scope.legacySpacePercent,
    });
    const billed =
      resolvedBase.model === "subscription"
        ? subscriptionBilledScope({
            source: resolvedBase.source,
            ...scope,
          })
        : null;
    const inventory = billed
      ? await loadBillableInventoryCounts(admin, billed)
      : null;
    const resolved = withSubscriptionResolution(resolvedBase, {
      ...scope,
      inventory,
    });
    const scopeType = viewScope(scope);

    return NextResponse.json({
      scope,
      inventory,
      labels: {
        organisationName: scope.organisationName,
        propertyName: scope.propertyName,
        spaceName: scope.spaceName,
      },
      precedence: buildCommercialPrecedencePath({
        viewScope: scopeType,
        spaceName: scope.spaceName,
        propertyName: scope.propertyName,
        organisationName: scope.organisationName,
        source: resolved.source,
      }),
      resolved: {
        ...resolved,
        inheritedFrom: inheritedFromLabel(resolved.source),
        inherited: resolved.source !== scopeType,
        isOverride: resolved.source === scopeType,
        summary: formatCommercialArrangement(resolved),
      },
      terms: rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load commercial terms.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);

  try {
    const created = await createCommercialTerms(admin, auth.userId, body);
    await adminAudit({
      action: "commercial_terms_created",
      actorUserId: auth.userId,
      targetType: created.scope_type,
      targetId: created.scope_id ?? "platform",
      meta: {
        commercial_model: created.commercial_model,
        commission_percent: created.commission_percent,
        transaction_fee_percent: created.transaction_fee_percent,
        monthly_subscription_amount: created.monthly_subscription_amount,
        subscription_pricing_mode: created.subscription_pricing_mode,
        tier_count: created.tiers.length,
        effective_from: created.effective_from,
      },
    });
    return NextResponse.json({ ok: true, term: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save commercial terms.";
    const status = /not found|must be|required|cannot|invalid|overlap|tier/i.test(
      message
    )
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
