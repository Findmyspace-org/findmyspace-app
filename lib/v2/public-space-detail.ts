import { supabase } from "@/lib/supabase";
import { isSpacePubliclyVisible } from "@/lib/listing-lifecycle";
import { passesPublicBrowseListingGate } from "@/lib/public-browse-eligibility";
import { PUBLIC_SPACE_SELECT } from "@/lib/public-space-columns";
import { sortSpaceImages } from "@/lib/sort-space-images";

export type V2PublicHostProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  created_at: string | null;
  owner_verification_status: string | null;
};

export type V2PublicSpaceDetail = {
  id: string;
  owner_id: string | null;
  title: string;
  description: string | null;
  status: string | null;
  public_listing_mode: string | null;
  is_bookable: boolean | null;
  city: string | null;
  suburb: string | null;
  street_address: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_amount: number | null;
  price_unit: string | null;
  deposit_required: boolean | null;
  deposit_amount: number | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
  min_group_size: number | null;
  max_group_size: number | null;
  latitude: number | null;
  longitude: number | null;
  image_urls: string[];
  attributes: Record<string, string[]>;
  host: V2PublicHostProfile | null;
};

type SpaceImageRow = {
  id: string;
  image_url: string;
  sort_order: number | null;
};

type SpaceAttributeRow = {
  attribute_key: string;
  attribute_value: string | null;
};

export async function getV2PublicSpaceDetail(
  id: string
): Promise<V2PublicSpaceDetail | null> {
  const { data, error } = await supabase
    .from("spaces")
    .select(PUBLIC_SPACE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const space = data as unknown as Omit<
    V2PublicSpaceDetail,
    "image_urls" | "attributes" | "host"
  >;

  if (
    !isSpacePubliclyVisible(space) ||
    !passesPublicBrowseListingGate(space)
  ) {
    return null;
  }

  const [imagesResult, attributesResult, hostResult] = await Promise.all([
    supabase
      .from("space_images")
      .select("id, image_url, sort_order")
      .eq("space_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("space_attributes")
      .select("attribute_key, attribute_value")
      .eq("space_id", id),
    space.owner_id
      ? supabase
          .from("profiles")
          .select(
            "id, first_name, last_name, full_name, created_at, owner_verification_status"
          )
          .eq("id", space.owner_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (imagesResult.error || attributesResult.error) return null;

  const attributes: Record<string, string[]> = {};
  for (const row of (attributesResult.data || []) as SpaceAttributeRow[]) {
    if (!row.attribute_value) continue;
    const values = attributes[row.attribute_key] || [];
    values.push(row.attribute_value);
    attributes[row.attribute_key] = values;
  }

  const images = sortSpaceImages(
    ((imagesResult.data || []) as SpaceImageRow[]).map((image) => ({
      ...image,
      sort_order: image.sort_order,
    }))
  );

  return {
    ...space,
    image_urls: images.map((image) => image.image_url),
    attributes,
    host: hostResult.error
      ? null
      : ((hostResult.data as V2PublicHostProfile | null) ?? null),
  };
}
