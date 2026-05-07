/**
 * Dynamic suggested-question lists for the SpaceAssistant.
 *
 * Goals:
 *   1. Surface 4–6 high-relevance prompts based on the listing's `space_type`.
 *   2. Add 1–2 booking-unit-aware prompts (hourly, daily, monthly) so renters
 *      see the questions that matter most for their access pattern.
 *   3. Always include a generic safety net so renters never see an empty list
 *      for unknown / new categories.
 *
 * The prompts here are the questions a renter is likely to ask BEFORE
 * booking — phrased as natural language. The assistant API then maps them
 * to the right intent. They are also the same prompts the renter can convert
 * into a yes/no question to the host via the batched form.
 */

export type BookingUnit = "hour" | "day" | "month" | string | null | undefined;

const STORAGE: string[] = [
  "Can I store furniture here?",
  "Is the space dry and lockable?",
  "Can I access my items weekly?",
  "Are hazardous items restricted?",
  "What should I provide before booking?",
  "Is this suitable for long-term storage?",
];

const PARKING: string[] = [
  "Will my vehicle fit?",
  "Is the parking covered?",
  "Is 24/7 access available?",
  "Is the parking behind a gate?",
  "Can I park a trailer here?",
  "What vehicle details must I provide?",
];

const WORKSPACE: string[] = [
  "Is Wi-Fi included?",
  "Can I book this for a full day?",
  "Is the space suitable for meetings?",
  "Is parking available nearby?",
  "Are after-hours bookings allowed?",
  "What should I provide before booking?",
];

const EVENT: string[] = [
  "How many people can the space take?",
  "Is catering allowed?",
  "Is alcohol allowed where legal?",
  "Is there parking on site?",
  "What setup time is allowed?",
  "Are noise restrictions in place?",
];

const WORKSHOP: string[] = [
  "Is power and lighting included?",
  "Can I leave equipment overnight?",
  "Is there secure access?",
  "Are there noise restrictions?",
  "Can I bring power tools?",
  "What should I provide before booking?",
];

const GENERIC_FALLBACK: string[] = [
  "What access hours are allowed?",
  "Is this space secure?",
  "What size items fit here?",
  "What should I provide before booking?",
  "Is this suitable for long-term use?",
  "What is included in the price?",
];

const HOURLY_EXTRAS: string[] = [
  "Is access flexible within my booked hours?",
  "Can I extend my booking on the day?",
];

const DAILY_EXTRAS: string[] = [
  "How early can I arrive on the day?",
  "Is there setup time included?",
];

const MONTHLY_EXTRAS: string[] = [
  "Is this suitable for long-term use?",
  "Can I access the space anytime during the month?",
];

function pickCategoryPrompts(spaceType: string | null | undefined): {
  list: string[];
  category:
    | "storage"
    | "parking"
    | "workspace"
    | "event"
    | "workshop"
    | "generic";
} {
  const value = (spaceType || "").toLowerCase();
  if (!value) return { list: GENERIC_FALLBACK, category: "generic" };

  if (value === "storage" || value === "garage") {
    return { list: STORAGE, category: "storage" };
  }
  if (value === "parking") {
    return { list: PARKING, category: "parking" };
  }
  if (
    value === "office" ||
    value === "meeting_room" ||
    value === "boardroom" ||
    value === "desk_coworking" ||
    value === "workspace"
  ) {
    return { list: WORKSPACE, category: "workspace" };
  }
  if (value === "event_space" || value === "event") {
    return { list: EVENT, category: "event" };
  }
  if (value === "workshop_studio" || value === "workshop") {
    return { list: WORKSHOP, category: "workshop" };
  }
  return { list: GENERIC_FALLBACK, category: "generic" };
}

function pickBookingUnitExtras(unit: BookingUnit): string[] {
  if (!unit) return [];
  const value = String(unit).toLowerCase();
  if (value === "hour" || value === "hourly") return HOURLY_EXTRAS;
  if (value === "day" || value === "daily") return DAILY_EXTRAS;
  if (value === "month" || value === "monthly") return MONTHLY_EXTRAS;
  return [];
}

/**
 * Returns a deduplicated list of 6 suggested questions tailored to the
 * listing. Stable ordering: category prompts first, then 1–2 booking-unit
 * prompts, capped at 6.
 */
export function getSuggestedAssistantQuestions(opts: {
  spaceType: string | null | undefined;
  bookingUnit: BookingUnit;
  limit?: number;
}): {
  prompts: string[];
  category:
    | "storage"
    | "parking"
    | "workspace"
    | "event"
    | "workshop"
    | "generic";
} {
  const limit = Math.max(2, Math.min(8, opts.limit ?? 6));
  const { list, category } = pickCategoryPrompts(opts.spaceType);
  const unitExtras = pickBookingUnitExtras(opts.bookingUnit);

  const seen = new Set<string>();
  const out: string[] = [];

  // Take 4 category prompts first so booking-unit context can fit alongside.
  for (const p of list) {
    if (out.length >= limit - 2) break;
    const key = p.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  // Inject 1–2 booking-unit-aware prompts.
  for (const p of unitExtras) {
    if (out.length >= limit) break;
    const key = p.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  // Fill remaining slots from the rest of the category list.
  for (const p of list) {
    if (out.length >= limit) break;
    const key = p.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  // Final safety: top up with generic questions if the category list was short.
  for (const p of GENERIC_FALLBACK) {
    if (out.length >= limit) break;
    const key = p.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  return { prompts: out, category };
}

/**
 * Smaller, host-yes/no-friendly templates used as quick-add chips inside
 * the batched "Ask the host" form. These mirror the suggested questions
 * but are phrased so a clear Yes / No / Not applicable answer makes sense.
 */
const HOST_TEMPLATES_BY_CATEGORY: Record<
  ReturnType<typeof getSuggestedAssistantQuestions>["category"],
  string[]
> = {
  storage: [
    "Is the space dry and lockable?",
    "Can I access my items weekly?",
    "Are hazardous items restricted?",
    "Is this suitable for long-term storage?",
  ],
  parking: [
    "Is the parking covered?",
    "Is 24/7 access available?",
    "Is the parking behind a gate?",
    "Can I park a trailer here?",
  ],
  workspace: [
    "Is Wi-Fi included?",
    "Are after-hours bookings allowed?",
    "Is parking available nearby?",
    "Is the space suitable for meetings?",
  ],
  event: [
    "Is catering allowed?",
    "Is alcohol allowed where legal?",
    "Is there parking on site?",
    "Are noise restrictions in place?",
  ],
  workshop: [
    "Is secure overnight storage allowed?",
    "Are noise restrictions in place?",
    "Is the space suitable for power tools?",
    "Is parking available nearby?",
  ],
  generic: [
    "Is weekend access allowed?",
    "Is the space covered?",
    "Is 24/7 access available?",
    "Is the space suitable for long-term use?",
  ],
};

export function getHostQuestionTemplates(opts: {
  spaceType: string | null | undefined;
  bookingUnit: BookingUnit;
  limit?: number;
}): string[] {
  const limit = Math.max(2, Math.min(6, opts.limit ?? 4));
  const { category } = pickCategoryPrompts(opts.spaceType);
  const base = HOST_TEMPLATES_BY_CATEGORY[category] || HOST_TEMPLATES_BY_CATEGORY.generic;
  return base.slice(0, limit);
}
