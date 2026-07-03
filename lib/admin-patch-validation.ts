import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";

const SPACE_TYPE_VALUES = new Set(LISTING_SPACE_TYPE_OPTIONS.map((o) => o.value));
const BOOKING_UNITS = new Set(["hour", "day", "month"]);

const MAX_TITLE = 200;
const MAX_DESC = 50_000;
const MAX_ADDR = 300;
const MAX_NAME = 200;
const MAX_PHONE = 40;
const MAX_PRICE = 100_000_000;
const MAX_MIN_BOOK = 9999;

export type AdminProfilePatchFields = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
};

export function parseReason(body: Record<string, unknown>): string | null {
  const r = body.reason;
  if (typeof r !== "string") return null;
  const t = r.trim();
  return t.length >= 3 ? t : null;
}

function trimOrNull(s: unknown): string | null {
  if (s === null || s === undefined) return null;
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t === "" ? null : t;
}

/**
 * Whitelist profile fields from JSON body. Rejects unknown keys.
 */
export function extractAdminProfilePatch(
  body: Record<string, unknown>
):
  | { ok: true; patch: AdminProfilePatchFields; reason: string }
  | { ok: false; error: string } {
  const allowed = new Set([
    "reason",
    "first_name",
    "last_name",
    "full_name",
    "phone",
  ]);
  for (const k of Object.keys(body)) {
    if (!allowed.has(k)) {
      return { ok: false, error: `Unknown field: ${k}` };
    }
  }

  const reason = parseReason(body);
  if (!reason) {
    return {
      ok: false,
      error: "Please provide reason (at least 3 characters).",
    };
  }

  const patch: AdminProfilePatchFields = {};
  if ("first_name" in body) {
    const v = trimOrNull(body.first_name);
    if (v !== null && v.length > MAX_NAME) {
      return { ok: false, error: "first_name is too long." };
    }
    patch.first_name = v;
  }
  if ("last_name" in body) {
    const v = trimOrNull(body.last_name);
    if (v !== null && v.length > MAX_NAME) {
      return { ok: false, error: "last_name is too long." };
    }
    patch.last_name = v;
  }
  if ("full_name" in body) {
    const v = trimOrNull(body.full_name);
    if (v !== null && v.length > MAX_NAME) {
      return { ok: false, error: "full_name is too long." };
    }
    patch.full_name = v;
  }
  if ("phone" in body) {
    const v = trimOrNull(body.phone);
    if (v !== null && v.length > MAX_PHONE) {
      return { ok: false, error: "phone is too long." };
    }
    patch.phone = v;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No profile fields to update." };
  }

  return { ok: true, patch, reason };
}

export type SpaceContentRow = {
  title: string | null;
  description: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
};

export type AdminSpaceContentPatchFields = Partial<
  Pick<
    SpaceContentRow,
    | "title"
    | "description"
    | "city"
    | "suburb"
    | "address_line_1"
    | "space_type"
    | "booking_unit"
    | "price_per_hour"
    | "price_per_day"
    | "price_per_month"
    | "min_booking_hours"
    | "min_booking_days"
    | "min_booking_months"
  >
>;

function parseNum(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() === "") return null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function extractAdminSpaceContentPatch(
  body: Record<string, unknown>
):
  | { ok: true; patch: AdminSpaceContentPatchFields; reason: string }
  | { ok: false; error: string } {
  const allowed = new Set([
    "reason",
    "title",
    "description",
    "city",
    "suburb",
    "address_line_1",
    "space_type",
    "booking_unit",
    "price_per_hour",
    "price_per_day",
    "price_per_month",
    "min_booking_hours",
    "min_booking_days",
    "min_booking_months",
  ]);
  for (const k of Object.keys(body)) {
    if (!allowed.has(k)) {
      return { ok: false, error: `Unknown field: ${k}` };
    }
  }

  const reason = parseReason(body);
  if (!reason) {
    return {
      ok: false,
      error: "Please provide reason (at least 3 characters).",
    };
  }

  const patch: AdminSpaceContentPatchFields = {};

  if ("title" in body) {
    const v = trimOrNull(body.title);
    if (v !== null && v.length > MAX_TITLE) {
      return { ok: false, error: "title is too long." };
    }
    if (v === null) {
      return { ok: false, error: "title cannot be empty." };
    }
    patch.title = v;
  }
  if ("description" in body) {
    const raw = body.description;
    if (raw === null || raw === undefined) {
      patch.description = null;
    } else if (typeof raw === "string") {
      if (raw.length > MAX_DESC) {
        return { ok: false, error: "description is too long." };
      }
      patch.description = raw.trim() === "" ? null : raw.trim();
    } else {
      return { ok: false, error: "description must be a string or null." };
    }
  }
  if ("city" in body) {
    const v = trimOrNull(body.city);
    if (v !== null && v.length > MAX_ADDR) {
      return { ok: false, error: "city is too long." };
    }
    patch.city = v;
  }
  if ("suburb" in body) {
    const v = trimOrNull(body.suburb);
    if (v !== null && v.length > MAX_ADDR) {
      return { ok: false, error: "suburb is too long." };
    }
    patch.suburb = v;
  }
  if ("address_line_1" in body) {
    const v = trimOrNull(body.address_line_1);
    if (v !== null && v.length > MAX_ADDR) {
      return { ok: false, error: "address_line_1 is too long." };
    }
    patch.address_line_1 = v;
  }
  if ("space_type" in body) {
    const v = trimOrNull(body.space_type);
    if (v === null || !SPACE_TYPE_VALUES.has(v)) {
      return { ok: false, error: "Invalid space_type." };
    }
    patch.space_type = v;
  }
  if ("booking_unit" in body) {
    let v = trimOrNull(body.booking_unit);
    if (v === "event") v = "day";
    if (v === null || !BOOKING_UNITS.has(v)) {
      return { ok: false, error: "booking_unit must be hour, day, or month." };
    }
    patch.booking_unit = v;
  }

  const numericKeys = [
    "price_per_hour",
    "price_per_day",
    "price_per_month",
    "min_booking_hours",
    "min_booking_days",
    "min_booking_months",
  ] as const;
  for (const key of numericKeys) {
    if (!(key in body)) continue;
    const n = parseNum(body[key]);
    if (n === undefined) {
      return { ok: false, error: `Invalid ${key}.` };
    }
    if (n !== null) {
      if (key.startsWith("price")) {
        if (n < 0 || n > MAX_PRICE || !Number.isFinite(n)) {
          return { ok: false, error: `Invalid ${key}.` };
        }
      } else {
        if (!Number.isInteger(n) || n < 1 || n > MAX_MIN_BOOK) {
          return {
            ok: false,
            error: `${key} must be an integer between 1 and ${MAX_MIN_BOOK}.`,
          };
        }
      }
    }
    patch[key] = n ?? null;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No listing fields to update." };
  }

  return { ok: true, patch, reason };
}

/** Validates merged space row (current + patch) for host-style pricing rules. */
export function validateMergedSpaceContent(row: SpaceContentRow): string | null {
  const unit = row.booking_unit || "";
  if (!BOOKING_UNITS.has(unit)) {
    return "booking_unit must be hour, day, or month.";
  }

  if (unit === "hour") {
    const p = row.price_per_hour;
    if (p === null || p === undefined || p <= 0) {
      return "For hourly listings, price_per_hour must be greater than 0.";
    }
    const m = row.min_booking_hours;
    if (m === null || m === undefined || m < 1) {
      return "For hourly listings, min_booking_hours must be at least 1.";
    }
  }
  if (unit === "day") {
    const p = row.price_per_day;
    if (p === null || p === undefined || p <= 0) {
      return "For daily listings, price_per_day must be greater than 0.";
    }
    const m = row.min_booking_days;
    if (m === null || m === undefined || m < 1) {
      return "For daily listings, min_booking_days must be at least 1.";
    }
  }
  if (unit === "month") {
    const p = row.price_per_month;
    if (p === null || p === undefined || p <= 0) {
      return "For monthly listings, price_per_month must be greater than 0.";
    }
    const m = row.min_booking_months;
    if (m === null || m === undefined || m < 1) {
      return "For monthly listings, min_booking_months must be at least 1.";
    }
  }

  const t = (row.title || "").trim();
  if (!t) {
    return "title is required.";
  }

  return null;
}

export function mergeSpaceContent(
  current: SpaceContentRow,
  patch: AdminSpaceContentPatchFields
): SpaceContentRow {
  return {
    title: patch.title !== undefined ? patch.title : current.title,
    description:
      patch.description !== undefined ? patch.description : current.description,
    city: patch.city !== undefined ? patch.city : current.city,
    suburb: patch.suburb !== undefined ? patch.suburb : current.suburb,
    address_line_1:
      patch.address_line_1 !== undefined
        ? patch.address_line_1
        : current.address_line_1,
    space_type:
      patch.space_type !== undefined ? patch.space_type : current.space_type,
    booking_unit:
      patch.booking_unit !== undefined
        ? patch.booking_unit
        : current.booking_unit,
    price_per_hour:
      patch.price_per_hour !== undefined
        ? patch.price_per_hour
        : current.price_per_hour,
    price_per_day:
      patch.price_per_day !== undefined
        ? patch.price_per_day
        : current.price_per_day,
    price_per_month:
      patch.price_per_month !== undefined
        ? patch.price_per_month
        : current.price_per_month,
    min_booking_hours:
      patch.min_booking_hours !== undefined
        ? patch.min_booking_hours
        : current.min_booking_hours,
    min_booking_days:
      patch.min_booking_days !== undefined
        ? patch.min_booking_days
        : current.min_booking_days,
    min_booking_months:
      patch.min_booking_months !== undefined
        ? patch.min_booking_months
        : current.min_booking_months,
  };
}
