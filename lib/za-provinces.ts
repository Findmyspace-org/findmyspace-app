export const ZA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
] as const;

export function formatListingAddress(parts: {
  street_address?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  address_line_1?: string | null;
}): string {
  return [
    parts.street_address || parts.address_line_1 || null,
    parts.suburb || null,
    parts.city || null,
    parts.province || null,
    parts.postal_code || null,
    parts.country || null,
  ]
    .filter(Boolean)
    .join(", ");
}
