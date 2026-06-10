const MAX_NAME = 200;
const MAX_DESC = 50_000;
const MAX_ADDR = 300;

export type PropertyInput = {
  name?: string | null;
  description?: string | null;
  address_line1?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  owner_email?: string | null;
  crm_organisation_id?: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseCoord(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePropertyInput(
  body: Record<string, unknown>,
  options: { requireName?: boolean } = {}
): { ok: true; data: PropertyInput } | { ok: false; error: string } {
  const data: PropertyInput = {};

  if ("name" in body) {
    const v = trimOrNull(body.name);
    if (!v && options.requireName) {
      return { ok: false, error: "Property name is required." };
    }
    if (v && v.length > MAX_NAME) {
      return { ok: false, error: "Name is too long." };
    }
    data.name = v;
  } else if (options.requireName) {
    return { ok: false, error: "Property name is required." };
  }

  if ("description" in body) {
    const v = trimOrNull(body.description);
    if (v && v.length > MAX_DESC) {
      return { ok: false, error: "Description is too long." };
    }
    data.description = v;
  }

  for (const key of [
    "address_line1",
    "suburb",
    "city",
    "province",
    "postal_code",
    "country",
  ] as const) {
    if (key in body) {
      const v = trimOrNull(body[key]);
      if (v && v.length > MAX_ADDR) {
        return { ok: false, error: `${key} is too long.` };
      }
      data[key] = v;
    }
  }

  if ("latitude" in body) {
    const v = parseCoord(body.latitude);
    if (v === undefined) return { ok: false, error: "Invalid latitude." };
    data.latitude = v;
  }
  if ("longitude" in body) {
    const v = parseCoord(body.longitude);
    if (v === undefined) return { ok: false, error: "Invalid longitude." };
    data.longitude = v;
  }

  if ("owner_email" in body) {
    const v = trimOrNull(body.owner_email);
    if (v && !v.includes("@")) {
      return { ok: false, error: "Invalid owner email." };
    }
    data.owner_email = v;
  }

  if ("crm_organisation_id" in body) {
    const v = trimOrNull(body.crm_organisation_id);
    if (v && !UUID_RE.test(v)) {
      return { ok: false, error: "Invalid CRM organisation id." };
    }
    data.crm_organisation_id = v;
  }

  return { ok: true, data };
}

export function buildPropertyRow(
  input: PropertyInput,
  adminUserId: string
): Record<string, unknown> {
  return {
    name: input.name?.trim() || "Untitled property",
    description: input.description ?? null,
    address_line1: input.address_line1 ?? null,
    suburb: input.suburb ?? null,
    city: input.city ?? null,
    province: input.province ?? null,
    postal_code: input.postal_code ?? null,
    country: input.country ?? "South Africa",
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    owner_id: null,
    owner_email: input.owner_email ?? null,
    crm_organisation_id: input.crm_organisation_id ?? null,
    created_by_admin: true,
    created_by_admin_id: adminUserId,
  };
}

export type PropertyAddressRow = {
  address_line1: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  crm_organisation_id: string | null;
};

export function prefillSpaceFromProperty(
  input: Record<string, unknown>,
  property: PropertyAddressRow
): Record<string, unknown> {
  const merged = { ...input };
  const addrKeys = [
    "city",
    "suburb",
    "province",
    "postal_code",
    "country",
    "latitude",
    "longitude",
  ] as const;

  for (const key of addrKeys) {
    if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
      const val = property[key];
      if (val !== null && val !== undefined) {
        merged[key] = val;
      }
    }
  }

  if (
    (merged.street_address === undefined ||
      merged.street_address === null ||
      merged.street_address === "") &&
    (merged.address_line_1 === undefined ||
      merged.address_line_1 === null ||
      merged.address_line_1 === "")
  ) {
    if (property.address_line1) {
      merged.street_address = property.address_line1;
      merged.address_line_1 = property.address_line1;
    }
  }

  if (
    (merged.crm_organisation_id === undefined ||
      merged.crm_organisation_id === null ||
      merged.crm_organisation_id === "") &&
    property.crm_organisation_id
  ) {
    merged.crm_organisation_id = property.crm_organisation_id;
  }

  return merged;
}

export function formatPropertyAddress(
  row: Pick<PropertyAddressRow, "address_line1" | "suburb" | "city" | "province">
): string {
  return [row.address_line1, row.suburb, row.city, row.province]
    .filter(Boolean)
    .join(", ");
}
