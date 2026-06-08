import { ZA_PROVINCES } from "@/lib/za-provinces";

export type GeocodedAddress = {
  label: string;
  streetAddress: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
};

export type NominatimAddress = Record<string, string | undefined>;

export type NominatimSearchItem = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
};

export function buildAddressQuery(parts: {
  streetAddress?: string;
  suburb?: string;
  city?: string;
  province?: string;
  country?: string;
}): string {
  return [
    parts.streetAddress?.trim(),
    parts.suburb?.trim(),
    parts.city?.trim(),
    parts.province?.trim(),
    parts.country?.trim() || "South Africa",
  ]
    .filter(Boolean)
    .join(", ");
}

export function normalizeZaProvince(value: string | undefined): string {
  if (!value?.trim()) return "";
  const trimmed = value.trim();
  const exact = ZA_PROVINCES.find(
    (p) => p.toLowerCase() === trimmed.toLowerCase()
  );
  if (exact) return exact;
  return trimmed;
}

export function pickReverseAddressFields(
  addr: NominatimAddress,
  displayName?: string
) {
  const streetName =
    addr.road || addr.pedestrian || addr.footway || addr.path || "";
  const streetAddress = [addr.house_number, streetName].filter(Boolean).join(" ").trim();
  const fallbackStreetLine = (displayName || "").split(",")[0]?.trim() || "";

  const suburbValue =
    addr.suburb ||
    addr.neighbourhood ||
    addr.neighborhood ||
    addr.quarter ||
    addr.district ||
    addr.locality ||
    addr.borough ||
    addr.hamlet ||
    addr.residential ||
    "";

  const cityValue =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    addr.state_district ||
    "";

  const provinceValue = normalizeZaProvince(addr.state || addr.province);
  const postalCodeValue = addr.postcode || "";
  const countryValue = addr.country || "South Africa";

  return {
    streetAddress: streetAddress || streetName || fallbackStreetLine,
    suburbValue,
    cityValue,
    provinceValue,
    postalCodeValue,
    countryValue,
  };
}

export function nominatimItemToGeocodedAddress(
  item: NominatimSearchItem
): GeocodedAddress | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const fields = pickReverseAddressFields(
    item.address || {},
    item.display_name || ""
  );

  return {
    label:
      item.display_name ||
      [fields.streetAddress, fields.suburbValue, fields.cityValue]
        .filter(Boolean)
        .join(", "),
    streetAddress: fields.streetAddress,
    suburb: fields.suburbValue,
    city: fields.cityValue,
    province: fields.provinceValue,
    postalCode: fields.postalCodeValue,
    country: fields.countryValue,
    latitude: lat,
    longitude: lng,
  };
}
