import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  formatSpaceTypeLabel,
  getOptionLabel,
  getSpaceFeatureLayout,
  normalizeFeatureAttributes,
  sectionFields,
  toCanonicalFeatureKey,
} from "@/app/data/spaceFeatureConfig";
import {
  RENTER_REQUIREMENT_LABELS,
  type ListingBookingRequirements,
  type RenterRequirementFieldKey,
} from "@/lib/booking-intelligence";
import { formatGroupSizePublic } from "@/lib/group-size";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Space Assistant API — controlled, context-based answers about a single listing.
 *
 * v1 behaviour:
 *   - Validates input (spaceId + question).
 *   - Blocks contact-sharing requests with a clear platform-policy reply.
 *   - Loads safe listing context (no host email/phone/exact address).
 *   - Generates an answer from listing data + a small intent matcher.
 *
 * TODO: swap the templated `buildAnswer` for an OpenAI / Vercel AI SDK call
 *       (use `buildSystemContext` output as the system prompt + RAG payload).
 * TODO: host escalation workflow when the assistant cannot answer.
 * TODO: persist unanswered questions to a `listing_faq` table so hosts can fill gaps.
 * TODO: moderation logging + assistant_confidence scoring on every reply.
 */

export const runtime = "nodejs";

const MAX_QUESTION_LENGTH = 600;

const SAFETY_CONTACT_REPLY =
  "Contact details and exact access information are shared only after a booking is approved and payment is completed.";

const FALLBACK_UNKNOWN_REPLY =
  "The host has not provided that detail yet. You can include this question in your booking request and the host will confirm it before payment.";

const ENCOURAGE_BOOKING_NOTE =
  "If you’d like the host to confirm specifics for your needs, send a booking request — nothing is charged until the host approves and you pay.";

type RequestBody = {
  spaceId?: string;
  question?: string;
};

type SpaceRow = {
  id: string;
  title: string | null;
  description: string | null;
  suburb: string | null;
  city: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  status: string | null;
  public_listing_mode: string | null;
};

type FeatureSummary = {
  booleanByCategory: { id: string; title: string; labels: string[] }[];
  values: { label: string; value: string }[];
  flatBooleanLabels: string[];
};

type ConfirmedQa = {
  question: string;
  answer: "yes" | "no" | "not_applicable";
};

type AssistantContext = {
  title: string;
  spaceType: string | null;
  spaceTypeLabel: string;
  suburb: string | null;
  city: string | null;
  description: string | null;
  bookingUnit: string | null;
  priceLine: string | null;
  minBookingNote: string | null;
  features: FeatureSummary;
  requirements: string[];
  confirmedQas: ConfirmedQa[];
  /**
   * Free-form host quality details captured under "Booking quality details"
   * in the listing flow (saved into `listing_questionnaires.data`). Already
   * pre-flattened to label/value pairs here so the templated answers can use
   * them without re-parsing per-category schemas.
   */
  questionnaireFacts: { label: string; value: string }[];
  groupSizeLine: string | null;
};

type IntentKind =
  | "vehicle_fit"
  | "access_hours"
  | "long_term_storage"
  | "before_booking"
  | "security"
  | "size_capacity"
  | "price"
  | "general";

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

function detectContactRequest(question: string): boolean {
  const lower = question.toLowerCase();

  const directContact =
    /\b(phone|cell|cellphone|mobile|whats ?app|whatsapp|email|e-?mail|telegram|signal|imessage|sms|text message)\b/;
  if (directContact.test(lower)) return true;

  const numberAsk = /\b(number|contact details?|contact info|reach (the )?host)\b/;
  if (numberAsk.test(lower)) return true;

  const offPlatform =
    /\b(off[ -]?platform|outside( the)? (app|platform|site)|direct(ly)?|in person|meet up|meet in person)\b/;
  if (offPlatform.test(lower)) return true;

  const exactAddress =
    /\b(home address|exact address|street address|full address|directions|where exactly|where is it located exactly|gps|coordinates)\b/;
  if (exactAddress.test(lower)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

function priceLine(space: SpaceRow): string | null {
  const items: string[] = [];
  if (space.price_per_hour && space.price_per_hour > 0) {
    items.push(`R${space.price_per_hour} per hour`);
  }
  if (space.price_per_day && space.price_per_day > 0) {
    items.push(`R${space.price_per_day} per day`);
  }
  if (space.price_per_month && space.price_per_month > 0) {
    items.push(`R${space.price_per_month} per month`);
  }
  return items.length ? items.join(", ") : null;
}

function minBookingNote(space: SpaceRow): string | null {
  if (space.booking_unit === "hour" && space.min_booking_hours) {
    return `Minimum booking: ${space.min_booking_hours} hour${space.min_booking_hours === 1 ? "" : "s"}.`;
  }
  if (space.booking_unit === "day" && space.min_booking_days) {
    return `Minimum booking: ${space.min_booking_days} day${space.min_booking_days === 1 ? "" : "s"}.`;
  }
  if (space.booking_unit === "month" && space.min_booking_months) {
    return `Minimum booking: ${space.min_booking_months} month${space.min_booking_months === 1 ? "" : "s"}.`;
  }
  return null;
}

function summariseFeatures(
  spaceType: string | null,
  attributes: Record<string, string[]>
): FeatureSummary {
  const norm = normalizeFeatureAttributes(attributes);
  const layout = getSpaceFeatureLayout(spaceType);
  const booleanByCategory: FeatureSummary["booleanByCategory"] = [];
  const values: FeatureSummary["values"] = [];
  const flatBooleanLabels: string[] = [];

  for (const sec of layout.sections) {
    const labels: string[] = [];
    for (const f of sectionFields(sec)) {
      const canonical = toCanonicalFeatureKey(f.key);
      const vals = norm[canonical] || [];
      if (vals.length === 0) continue;
      if (f.kind === "checkbox") {
        if (vals.includes("yes")) {
          labels.push(f.label);
          flatBooleanLabels.push(f.label);
        }
      } else if (f.kind === "radio") {
        const v = vals[0];
        if (v) values.push({ label: f.label, value: getOptionLabel(f, v) });
      } else if (f.kind === "multiselect") {
        const text = vals
          .map((v) => getOptionLabel(f, v))
          .filter(Boolean)
          .join(", ");
        if (text) values.push({ label: f.label, value: text });
      }
    }
    if (labels.length) booleanByCategory.push({ id: sec.id, title: sec.title, labels });
  }

  return { booleanByCategory, values, flatBooleanLabels };
}

function summariseRequirements(req: ListingBookingRequirements | null): string[] {
  if (!req) return [];
  const out: string[] = [];
  for (const k of Object.keys(req) as RenterRequirementFieldKey[]) {
    if (req[k]) {
      const label = RENTER_REQUIREMENT_LABELS[k];
      if (label) out.push(label);
    }
  }
  return out;
}

async function loadAssistantContext(
  spaceId: string
): Promise<AssistantContext | null> {
  const { data: spaceRow, error: spaceErr } = await supabase
    .from("spaces")
    .select(
      "id, title, description, suburb, city, space_type, booking_unit, price_per_hour, price_per_day, price_per_month, min_booking_hours, min_booking_days, min_booking_months, min_group_size, max_group_size, status, public_listing_mode"
    )
    .eq("id", spaceId)
    .single();

  if (spaceErr || !spaceRow) return null;

  const space = spaceRow as unknown as SpaceRow;

  if (
    space.status !== "active" ||
    space.public_listing_mode !== "live"
  ) {
    return null;
  }

  const { data: attrRows } = await supabase
    .from("space_attributes")
    .select("attribute_key, attribute_value")
    .eq("space_id", spaceId);

  const attributes: Record<string, string[]> = {};
  (attrRows || []).forEach((r) => {
    const row = r as { attribute_key: string; attribute_value: string | null };
    if (!row.attribute_value) return;
    if (!attributes[row.attribute_key]) attributes[row.attribute_key] = [];
    attributes[row.attribute_key].push(row.attribute_value);
  });

  // listing_questionnaires.data — host-authored booking-quality details
  // captured during the listing flow. Flattened below into label/value
  // facts that the templated answers and (future) LLM prompt can consume.
  let questionnaireFacts: { label: string; value: string }[] = [];
  try {
    const { data: qRow } = await (supabase.from(
      "listing_questionnaires" as never
    ) as any)
      .select("data, category")
      .eq("space_id", spaceId)
      .maybeSingle();
    if (qRow?.data && typeof qRow.data === "object") {
      questionnaireFacts = flattenQuestionnaireFacts(
        qRow.data as Record<string, unknown>
      );
    }
  } catch (questionnaireErr) {
    console.warn(
      "space-assistant: questionnaire fetch failed",
      questionnaireErr
    );
  }

  const { data: reqRow } = await (supabase.from(
    "listing_booking_requirements" as never
  ) as any)
    .select(
      "require_item_type, require_dimensions, require_photos, require_vehicle_details, require_access_frequency, require_estimated_value, require_notes"
    )
    .eq("space_id", spaceId)
    .maybeSingle();

  const features = summariseFeatures(space.space_type, attributes);
  const requirements = summariseRequirements(
    (reqRow as ListingBookingRequirements | null) ?? null
  );

  // Reuse answered yes/no questions as host-confirmed FAQ. RLS on this table
  // is strict (renter+owner only), so we read via the service role.
  const admin = getAdminClient();
  const confirmedQas: ConfirmedQa[] = [];
  if (admin) {
    const { data: qaRows } = await (admin.from("listing_yes_no_questions") as any)
      .select("question, answer")
      .eq("space_id", spaceId)
      .eq("status", "answered")
      .eq("used_for_listing_faq", true)
      .order("answered_at", { ascending: false })
      .limit(20);
    (qaRows || []).forEach((row: any) => {
      if (
        row?.question &&
        ["yes", "no", "not_applicable"].includes(row?.answer)
      ) {
        confirmedQas.push({
          question: String(row.question),
          answer: row.answer as ConfirmedQa["answer"],
        });
      }
    });
  }

  return {
    title: (space.title || "this space").trim(),
    spaceType: space.space_type,
    spaceTypeLabel: formatSpaceTypeLabel(space.space_type),
    suburb: space.suburb,
    city: space.city,
    description: space.description ? space.description.trim() : null,
    bookingUnit: space.booking_unit,
    priceLine: priceLine(space),
    minBookingNote: minBookingNote(space),
    features,
    requirements,
    confirmedQas,
    questionnaireFacts,
    groupSizeLine: formatGroupSizePublic(space.min_group_size, space.max_group_size),
  };
}

// Flatten the booking-quality questionnaire JSON into a small list of
// human-readable facts. Keys come in many shapes (snake_case, camelCase,
// nested objects), so we normalise keys to "Title Case" labels and skip
// empty / object-only values.
function flattenQuestionnaireFacts(
  data: Record<string, unknown>,
  prefix = ""
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const humanise = (raw: string) =>
    raw
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  for (const [key, value] of Object.entries(data)) {
    const label = prefix
      ? `${prefix} — ${humanise(key)}`
      : humanise(key);
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "boolean") {
      out.push({ label, value: value ? "Yes" : "No" });
      continue;
    }
    if (typeof value === "number") {
      out.push({ label, value: String(value) });
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) out.push({ label, value: trimmed });
      continue;
    }
    if (Array.isArray(value)) {
      const text = value
        .map((v) =>
          typeof v === "string"
            ? v.trim()
            : typeof v === "number" || typeof v === "boolean"
              ? String(v)
              : null
        )
        .filter((v): v is string => Boolean(v))
        .join(", ");
      if (text) out.push({ label, value: text });
      continue;
    }
    if (typeof value === "object") {
      out.push(
        ...flattenQuestionnaireFacts(
          value as Record<string, unknown>,
          label
        )
      );
    }
  }
  // Cap to keep prompts/templates compact.
  return out.slice(0, 30);
}

// ---------------------------------------------------------------------------
// Confirmed Q&A matcher — first-class context for answered yes/no questions
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "this",
  "that",
  "with",
  "from",
  "have",
  "does",
  "your",
  "yours",
  "you",
  "are",
  "the",
  "and",
  "for",
  "can",
  "could",
  "would",
  "should",
  "will",
  "is",
  "it",
  "to",
  "a",
  "an",
  "in",
  "on",
  "of",
  "at",
  "be",
  "do",
  "i",
  "my",
  "me",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
}

const CONFIRMED_ANSWER_PHRASE: Record<ConfirmedQa["answer"], string> = {
  yes: "Yes. The host has confirmed",
  no: "No. The host has indicated",
  not_applicable: "The host marked this as not applicable for",
};

function answerFromConfirmedQa(
  ctx: AssistantContext,
  userQuestion: string
): string | null {
  if (!ctx.confirmedQas.length) return null;
  const userTokens = tokenize(userQuestion);
  if (userTokens.size === 0) return null;

  let best: { qa: ConfirmedQa; score: number } | null = null;
  for (const qa of ctx.confirmedQas) {
    const qaTokens = tokenize(qa.question);
    if (qaTokens.size === 0) continue;
    let overlap = 0;
    qaTokens.forEach((t) => {
      if (userTokens.has(t)) overlap += 1;
    });
    if (overlap >= 2 && (!best || overlap > best.score)) {
      best = { qa, score: overlap };
    }
  }
  if (!best) return null;
  const phrase = CONFIRMED_ANSWER_PHRASE[best.qa.answer];
  const cleaned = best.qa.question.replace(/\s+/g, " ").trim();
  return [
    intro(ctx),
    `${phrase}: “${cleaned}”`,
    ENCOURAGE_BOOKING_NOTE,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Intent matching + answer construction
// ---------------------------------------------------------------------------

function classifyIntent(question: string): IntentKind {
  const lower = question.toLowerCase();

  if (/\b(vehicle|car|bakkie|trailer|caravan|boat|truck|suv|motorbike|motorcycle|bike)\b/.test(lower))
    return "vehicle_fit";

  if (/\b(access|hours|when can|24[ -]?7|24\/7|night|after hours|opening|gate hours|allowed in)\b/.test(lower))
    return "access_hours";

  if (/\b(long.?term|monthly|months|long stay|extended)\b/.test(lower))
    return "long_term_storage";

  if (/\b(need.+(book|booking)|require|requirements?|documents?|paperwork|provide|prepare|before booking|what (do|will) i need)\b/.test(lower))
    return "before_booking";

  if (/\b(secure|safe|safety|cctv|gated|guard|guarded|locked?|lockable|theft|security)\b/.test(lower))
    return "security";

  if (/\b(size|dimension|fit|group size|how (much|many)|big enough|small enough|space (does|is))\b/.test(lower))
    return "size_capacity";

  if (/\b(price|cost|how much|pricing|rate|deposit)\b/.test(lower)) return "price";

  return "general";
}

function findValue(features: FeatureSummary, matcher: RegExp): string | null {
  for (const v of features.values) {
    if (matcher.test(v.label)) return v.value;
  }
  return null;
}

function findBooleanLabels(features: FeatureSummary, matcher: RegExp): string[] {
  return features.flatBooleanLabels.filter((l) => matcher.test(l));
}

function intro(ctx: AssistantContext): string {
  const where = [ctx.suburb, ctx.city].filter(Boolean).join(", ");
  if (where) return `About “${ctx.title}” (${ctx.spaceTypeLabel}) in ${where}:`;
  return `About “${ctx.title}” (${ctx.spaceTypeLabel}):`;
}

function joinBullets(lines: string[]): string {
  return lines.map((l) => `• ${l}`).join("\n");
}

function answerVehicleFit(ctx: AssistantContext): string | null {
  const parkingType = findValue(ctx.features, /parking type/i);
  const vehicles = findValue(ctx.features, /vehicle suitability/i);
  const lines: string[] = [];
  if (parkingType) lines.push(`Parking type: ${parkingType}`);
  if (vehicles) lines.push(`Suited for: ${vehicles}`);
  // Workshop/storage hints
  const sizeBand = findValue(ctx.features, /^size$/i) || findValue(ctx.features, /storage size/i);
  if (sizeBand) lines.push(`Size: ${sizeBand}`);
  if (lines.length === 0) return null;
  return [intro(ctx), joinBullets(lines), ENCOURAGE_BOOKING_NOTE].join("\n\n");
}

function answerAccessHours(ctx: AssistantContext): string | null {
  const labels = findBooleanLabels(
    ctx.features,
    /(24\/?7|access|secure entry|gated|elevator|ground floor|weekend|night|daytime|wheelchair)/i
  );
  if (labels.length === 0) return null;
  const lines = [`Access details on this listing: ${labels.join(", ")}.`];
  if (ctx.bookingUnit === "hour") {
    lines.push("This space is bookable by the hour, so access aligns with your selected slot.");
  }
  return [intro(ctx), joinBullets(lines), ENCOURAGE_BOOKING_NOTE].join("\n\n");
}

function answerLongTermStorage(ctx: AssistantContext): string | null {
  const lines: string[] = [];
  if (ctx.bookingUnit === "month") {
    lines.push("This listing is set up for monthly rentals.");
  } else if (ctx.bookingUnit) {
    lines.push(`The host has set this listing's primary unit to ${ctx.bookingUnit}.`);
  }
  if (ctx.priceLine) lines.push(`Pricing: ${ctx.priceLine}.`);
  const conditions = findBooleanLabels(
    ctx.features,
    /(dry|climate|ventilated|lockable|secure entry)/i
  );
  if (conditions.length) lines.push(`Conditions on this listing: ${conditions.join(", ")}.`);
  if (lines.length === 0) return null;
  return [intro(ctx), joinBullets(lines), ENCOURAGE_BOOKING_NOTE].join("\n\n");
}

function answerBeforeBooking(ctx: AssistantContext): string | null {
  const lines: string[] = [];
  if (ctx.requirements.length) {
    lines.push(
      `For your booking request, the host asks for: ${ctx.requirements.join(", ")}.`
    );
  } else {
    lines.push(
      "The host hasn’t set required booking-request fields. Add a short note describing what you need and the host will follow up if anything is missing."
    );
  }
  if (ctx.minBookingNote) lines.push(ctx.minBookingNote);
  if (ctx.priceLine) lines.push(`Pricing: ${ctx.priceLine}.`);
  // Surface up to two host-supplied booking-quality notes so the renter
  // sees specifics like "estimated turnaround", "preferred lead time", etc.
  if (ctx.questionnaireFacts.length) {
    ctx.questionnaireFacts.slice(0, 2).forEach((f) => {
      lines.push(`${f.label}: ${f.value}.`);
    });
  }
  return [intro(ctx), joinBullets(lines), ENCOURAGE_BOOKING_NOTE].join("\n\n");
}

function answerSecurity(ctx: AssistantContext): string | null {
  const labels = findBooleanLabels(
    ctx.features,
    /(cctv|gated|guard|lockable|secure entry|elevator)/i
  );
  if (labels.length === 0) return null;
  return [
    intro(ctx),
    `Security features the host has confirmed: ${labels.join(", ")}.`,
    ENCOURAGE_BOOKING_NOTE,
  ].join("\n\n");
}

function answerSizeCapacity(ctx: AssistantContext): string | null {
  const lines: string[] = [];
  const size = findValue(ctx.features, /^size$/i) || findValue(ctx.features, /storage size/i);
  const venue = findValue(ctx.features, /venue type/i);
  const parkingType = findValue(ctx.features, /parking type/i);
  if (ctx.groupSizeLine) lines.push(ctx.groupSizeLine);
  if (size) lines.push(`Size: ${size}`);
  if (venue) lines.push(`Venue type: ${venue}`);
  if (parkingType) lines.push(`Parking type: ${parkingType}`);
  if (lines.length === 0) return null;
  return [intro(ctx), joinBullets(lines), ENCOURAGE_BOOKING_NOTE].join("\n\n");
}

function answerPrice(ctx: AssistantContext): string | null {
  if (!ctx.priceLine) return null;
  const lines = [`Pricing: ${ctx.priceLine}.`];
  if (ctx.minBookingNote) lines.push(ctx.minBookingNote);
  return [intro(ctx), joinBullets(lines), ENCOURAGE_BOOKING_NOTE].join("\n\n");
}

function answerGeneral(ctx: AssistantContext): string | null {
  const lines: string[] = [];
  if (ctx.description) {
    const trimmed =
      ctx.description.length > 320
        ? ctx.description.slice(0, 320).trimEnd() + "…"
        : ctx.description;
    lines.push(trimmed);
  }
  const headlineFeatures = ctx.features.flatBooleanLabels.slice(0, 5);
  if (headlineFeatures.length) lines.push(`Highlights: ${headlineFeatures.join(", ")}.`);
  if (ctx.priceLine) lines.push(`Pricing: ${ctx.priceLine}.`);
  if (ctx.questionnaireFacts.length) {
    const facts = ctx.questionnaireFacts
      .slice(0, 4)
      .map((f) => `${f.label}: ${f.value}`);
    lines.push(`Host details: ${facts.join("; ")}.`);
  }
  if (lines.length === 0) return null;
  return [intro(ctx), lines.join("\n"), ENCOURAGE_BOOKING_NOTE].join("\n\n");
}

function buildAnswer(intent: IntentKind, ctx: AssistantContext): string | null {
  switch (intent) {
    case "vehicle_fit":
      return answerVehicleFit(ctx);
    case "access_hours":
      return answerAccessHours(ctx);
    case "long_term_storage":
      return answerLongTermStorage(ctx);
    case "before_booking":
      return answerBeforeBooking(ctx);
    case "security":
      return answerSecurity(ctx);
    case "size_capacity":
      return answerSizeCapacity(ctx);
    case "price":
      return answerPrice(ctx);
    case "general":
    default:
      return answerGeneral(ctx);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  let body: RequestBody | null = null;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const spaceId = (body?.spaceId || "").trim();
  const rawQuestion = (body?.question || "").trim();
  if (!spaceId) {
    return NextResponse.json({ error: "Missing spaceId" }, { status: 400 });
  }
  const question = rawQuestion.slice(0, MAX_QUESTION_LENGTH);
  if (!question) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  if (detectContactRequest(question)) {
    // TODO: log moderation event for safety analytics.
    return NextResponse.json({
      kind: "safety",
      answer: SAFETY_CONTACT_REPLY,
    });
  }

  let ctx: AssistantContext | null = null;
  try {
    ctx = await loadAssistantContext(spaceId);
  } catch {
    return NextResponse.json({ error: "Failed to load listing context" }, { status: 500 });
  }

  if (!ctx) {
    return NextResponse.json(
      { error: "Listing not available" },
      { status: 404 }
    );
  }

  // Prefer host-confirmed Q&A when the new question matches a previously
  // answered yes/no question on the same listing.
  const confirmed = answerFromConfirmedQa(ctx, question);
  if (confirmed) {
    return NextResponse.json({ kind: "context", answer: confirmed });
  }

  const intent = classifyIntent(question);
  const answer = buildAnswer(intent, ctx);

  if (!answer) {
    // TODO: persist this question to a `listing_faq` queue for the host to fill.
    return NextResponse.json({
      kind: "fallback",
      answer: FALLBACK_UNKNOWN_REPLY,
    });
  }

  return NextResponse.json({ kind: "context", answer });
}
