import {
  nominatimItemToGeocodedAddress,
  type GeocodedAddress,
  type NominatimSearchItem,
} from "@/lib/geocoding";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

function nominatimUserAgent(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://findmyspace.co.za";
  return (
    process.env.NOMINATIM_USER_AGENT?.trim() ||
    `FindMySpace/1.0 (${site}; admin geocoding)`
  );
}

async function nominatimFetch(path: string): Promise<Response> {
  const res = await fetch(`${NOMINATIM_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": nominatimUserAgent(),
    },
    next: { revalidate: 0 },
  });
  return res;
}

export async function nominatimSearch(
  query: string,
  options?: { limit?: number; countrycodes?: string }
): Promise<GeocodedAddress[]> {
  const limit = Math.min(Math.max(options?.limit ?? 5, 1), 10);
  const countrycodes = options?.countrycodes ?? "za";
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    q: query,
    limit: String(limit),
    countrycodes,
  });

  const res = await nominatimFetch(`/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Address search failed (${res.status}).`);
  }

  const data = (await res.json()) as NominatimSearchItem[];
  return (data || [])
    .map((item) => nominatimItemToGeocodedAddress(item))
    .filter((item): item is GeocodedAddress => item !== null);
}

export async function nominatimReverse(
  lat: number,
  lng: number
): Promise<GeocodedAddress | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    lat: String(lat),
    lon: String(lng),
  });

  const res = await nominatimFetch(`/reverse?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Reverse geocoding failed (${res.status}).`);
  }

  const data = (await res.json()) as NominatimSearchItem;
  return nominatimItemToGeocodedAddress({
    display_name: data.display_name,
    lat: String(lat),
    lon: String(lng),
    address: data.address,
  });
}
