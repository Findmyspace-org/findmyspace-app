import { NextRequest, NextResponse } from "next/server";
import { requireOwnerPropertyApi } from "@/lib/require-owner-property-api";
import { formatPropertyAddress } from "@/lib/admin-property";
import { computeListingCompletion } from "@/lib/listing-completion";
import { getOwnerListingStatusLabel } from "@/lib/listing-lifecycle";
import { buildOwnerPropertySpaceSteps } from "@/lib/owner-property-space-steps";
import {
  buildOwnerReadinessAttentionHrefs,
  computeOwnerPropertyReadinessProgress,
} from "@/lib/owner-property-readiness";
import { hasAiKnowledgeContent } from "@/lib/space-ai-knowledge";
import {
  computePropertySpacesHealth,
  computePropertySpacesSummary,
  spaceHasLocation,
  spaceHasPhotos,
  spaceHasPricing,
  type PropertySpaceHealthInput,
} from "@/lib/property-space-ops";
import { isArchivedSpace } from "@/lib/space-archive";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOwnerPropertyApi(req, id);
  if ("response" in auth) return auth.response;

  const { data: property, error } = await auth.admin
    .from("properties")
    .select("id, name, description, address_line1, suburb, city, province, postal_code, country, owner_accepted_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const row = property as Record<string, unknown>;

  const { data: spaces, error: spacesErr } = await auth.admin
    .from("spaces")
    .select(
      "id, title, status, space_type, city, suburb, public_listing_mode, booking_unit, price_amount, price_unit, deposit_required, deposit_amount, price_per_hour, price_per_day, price_per_month, latitude, longitude"
    )
    .eq("property_id", id)
    .order("title", { ascending: true });

  if (spacesErr) {
    return NextResponse.json({ error: spacesErr.message }, { status: 500 });
  }

  const rawSpaces = (spaces || []) as Record<string, unknown>[];
  const spaceIds = rawSpaces.map((space) => space.id as string);
  const imageCounts: Record<string, number> = {};
  const aiInfoBySpace: Record<string, boolean> = {};

  if (spaceIds.length > 0) {
    const { data: images } = await auth.admin
      .from("space_images")
      .select("space_id")
      .in("space_id", spaceIds);

    for (const image of (images as { space_id: string }[]) || []) {
      imageCounts[image.space_id] = (imageCounts[image.space_id] || 0) + 1;
    }

    const { data: aiDocs } = await auth.admin
      .from("space_ai_documents")
      .select("space_id, extracted_text")
      .in("space_id", spaceIds);

    for (const doc of (aiDocs as { space_id: string; extracted_text: string }[]) || []) {
      if (hasAiKnowledgeContent(doc.extracted_text)) {
        aiInfoBySpace[doc.space_id] = true;
      }
    }
  }

  const healthInputs: PropertySpaceHealthInput[] = rawSpaces.map((space) => {
    const spaceId = space.id as string;
    return {
      id: spaceId,
      status: space.status as string | null,
      public_listing_mode: space.public_listing_mode as string | null,
      booking_unit: space.booking_unit as string | null,
      price_amount: space.price_amount as number | null,
      price_unit: space.price_unit as string | null,
      deposit_required: space.deposit_required as boolean | null,
      deposit_amount: space.deposit_amount as number | null,
      price_per_hour: space.price_per_hour as number | null,
      price_per_day: space.price_per_day as number | null,
      price_per_month: space.price_per_month as number | null,
      latitude: space.latitude as number | null,
      longitude: space.longitude as number | null,
      city: space.city as string | null,
      suburb: space.suburb as string | null,
      image_count: imageCounts[spaceId] || 0,
      has_ai_information: Boolean(aiInfoBySpace[spaceId]),
    };
  });

  const summary = computePropertySpacesSummary(
    rawSpaces.map((space) => ({
      status: space.status as string | null,
      public_listing_mode: space.public_listing_mode as string | null,
    }))
  );
  const health = computePropertySpacesHealth(healthInputs);

  const readinessSpaceInputs = rawSpaces.map((space) => {
    const spaceId = space.id as string;
    const input = healthInputs.find((item) => item.id === spaceId)!;
    return {
      id: spaceId,
      status: space.status as string | null,
      public_listing_mode: space.public_listing_mode as string | null,
      has_photos: spaceHasPhotos(input.image_count),
      has_pricing: spaceHasPricing(input),
      has_location: spaceHasLocation(input),
      is_archived: isArchivedSpace(space.status as string | null),
    };
  });

  const spaceRows = await Promise.all(
    rawSpaces.map(async (space) => {
      const spaceId = space.id as string;
      const input = healthInputs.find((item) => item.id === spaceId)!;
      const readinessInput = readinessSpaceInputs.find((item) => item.id === spaceId)!;
      const completion = await computeListingCompletion(auth.admin, spaceId);
      const canSubmit = completion?.canSubmit ?? false;
      const publicListingMode =
        completion?.publicListingMode ?? (space.public_listing_mode as string | null);

      return {
        id: spaceId,
        title: space.title as string | null,
        status: space.status as string | null,
        space_type: space.space_type as string | null,
        city: space.city as string | null,
        suburb: space.suburb as string | null,
        public_listing_mode: space.public_listing_mode as string | null,
        can_submit: canSubmit,
        inherited_ownership: completion?.inheritedOwnership ?? false,
        status_label: getOwnerListingStatusLabel(space.status as string | null, {
          canSubmit,
          publicListingMode,
        }),
        has_photos: readinessInput.has_photos,
        has_pricing: readinessInput.has_pricing,
        has_location: readinessInput.has_location,
        has_ai_information: Boolean(aiInfoBySpace[spaceId]),
        is_archived: readinessInput.is_archived,
        steps: buildOwnerPropertySpaceSteps({
          spaceId,
          status: space.status as string | null,
          completion,
        }),
      };
    })
  );

  const activeSpaces = spaceRows.filter((space) => !space.is_archived);
  const archivedSpaces = spaceRows.filter((space) => space.is_archived);

  const progress = computeOwnerPropertyReadinessProgress({
    spaces: activeSpaces.map((space) => ({
      id: space.id,
      status: space.status,
      public_listing_mode: space.public_listing_mode,
      has_photos: space.has_photos,
      has_pricing: space.has_pricing,
      has_location: space.has_location,
      is_archived: space.is_archived,
      can_submit: space.can_submit,
    })),
    archivedSpaces: archivedSpaces.map((space) => ({
      id: space.id,
      status: space.status,
      public_listing_mode: space.public_listing_mode,
      has_photos: space.has_photos,
      has_pricing: space.has_pricing,
      has_location: space.has_location,
      is_archived: space.is_archived,
      can_submit: space.can_submit,
    })),
    summary,
    health,
  });

  const attention_hrefs = buildOwnerReadinessAttentionHrefs(
    activeSpaces.map((space) => ({
      id: space.id,
      status: space.status,
      public_listing_mode: space.public_listing_mode,
      has_photos: space.has_photos,
      has_pricing: space.has_pricing,
      has_location: space.has_location,
      is_archived: space.is_archived,
      can_submit: space.can_submit,
    }))
  );

  return NextResponse.json({
    property: {
      ...row,
      formatted_address: formatPropertyAddress({
        address_line1: row.address_line1 as string | null,
        suburb: row.suburb as string | null,
        city: row.city as string | null,
        province: row.province as string | null,
      }),
    },
    summary,
    health,
    progress,
    attention_hrefs,
    spaces: activeSpaces,
    archived_spaces: archivedSpaces,
  });
}
