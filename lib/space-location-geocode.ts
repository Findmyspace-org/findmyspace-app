import { adminApiFetch } from "@/lib/admin-api-client";
import { ownerApiFetch } from "@/lib/owner-api-client";
import type { GeocodedAddress } from "@/lib/geocoding";

export type SpaceLocationApiMode = "admin" | "owner";

function geocodeBase(apiMode: SpaceLocationApiMode) {
  return apiMode === "admin" ? "/api/admin/geocode" : "/api/geocode";
}

function mapsResolveBase(apiMode: SpaceLocationApiMode) {
  return apiMode === "admin" ? "/api/admin/maps/resolve-url" : "/api/maps/resolve-url";
}

async function locationApiFetch(
  apiMode: SpaceLocationApiMode,
  path: string,
  init?: RequestInit
) {
  if (apiMode === "admin") return adminApiFetch(path, init);
  return ownerApiFetch(path, init);
}

export async function searchGeocodeAddresses(
  apiMode: SpaceLocationApiMode,
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<GeocodedAddress[]> {
  const result = await locationApiFetch(
    apiMode,
    `${geocodeBase(apiMode)}?q=${encodeURIComponent(query)}&limit=${limit}`,
    { signal }
  );
  return (result.results as GeocodedAddress[]) || [];
}

export async function reverseGeocodeAddress(
  apiMode: SpaceLocationApiMode,
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<GeocodedAddress | null> {
  const result = await locationApiFetch(
    apiMode,
    `${geocodeBase(apiMode)}?lat=${lat}&lng=${lng}`,
    { signal }
  );
  return (result.result as GeocodedAddress | undefined) ?? null;
}

export async function resolveMapsUrlForLocation(
  apiMode: SpaceLocationApiMode,
  url: string
): Promise<{
  resolvedUrl?: string;
  coordinates?: { lat: number; lng: number } | null;
  searchQuery?: string | null;
}> {
  return locationApiFetch(
    apiMode,
    `${mapsResolveBase(apiMode)}?url=${encodeURIComponent(url)}`
  );
}
