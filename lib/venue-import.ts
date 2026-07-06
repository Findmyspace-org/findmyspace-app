import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPropertyRow } from "@/lib/admin-property";
import {
  buildUnclaimedSpaceRow,
  parseUnclaimedSpaceInput,
  syncSpaceAttributes,
  type AdminUnclaimedStatus,
} from "@/lib/admin-unclaimed-space";

export const VENUE_IMPORT_DEFAULT_MAX_PAGES = 20;
export const VENUE_IMPORT_DEFAULT_CRAWL_DEPTH = 2;
export const VENUE_IMPORT_MAX_PAGES = 20;
export const VENUE_IMPORT_MAX_DEPTH = 3;
export const VENUE_IMPORT_MAX_HTML_BYTES = 1_000_000;
export const VENUE_IMPORT_FETCH_TIMEOUT_MS = 9000;

const RELEVANT_PATH_RE =
  /(venue|space|room|hall|event|wedding|function|conference|sport|facility|facilities|gallery|pricing|price|rates|contact|terms|clubhouse|field|court|boardroom|classroom|braai)/i;
const SKIP_PATH_RE =
  /(blog|privacy|cookie|login|admin|cart|checkout|account|wp-admin|feed|tag|category|author|facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok)/i;
const SPACE_NAME_RE =
  /\b([A-Z][A-Za-z0-9'& -]{2,70}\s(?:Hall|Room|Boardroom|Classroom|Field|Court|Clubhouse|Garden|Venue|Chapel|Suite|Auditorium|Studio|Lawn|Terrace|Braai Area|Conference Centre|Function Room))\b/g;
const CAPACITY_RE = /\b(?:up to|capacity|seats?|accommodates?|guests?)\D{0,30}(\d{2,5})\b/i;
const PRICE_RE = /\bR\s?(\d[\d\s,.]{1,12})\b/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?27|0)\s?(?:\d[\s-]?){8,10}/g;

export type VenueImportPageType =
  | "home"
  | "venue"
  | "space"
  | "gallery"
  | "pricing"
  | "contact"
  | "terms"
  | "unknown";

export type CrawledPage = {
  url: string;
  title: string | null;
  status_code: number | null;
  content_hash: string | null;
  extracted_text: string | null;
  page_type: VenueImportPageType;
  html?: string;
};

export type ExtractedImageCandidate = {
  candidate_type: "property" | "space";
  candidate_id?: string | null;
  image_url: string;
  alt_text?: string | null;
  source_url?: string | null;
  selected?: boolean;
  confidence_score?: number;
};

export type VenueImportExtraction = {
  property: Record<string, unknown>;
  spaces: Record<string, unknown>[];
  images: ExtractedImageCandidate[];
  summary: string;
  confidence: number;
};

export function normalizeVenueImportUrl(input: string): {
  url: string;
  normalizedDomain: string;
} {
  const raw = input.trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  url.hash = "";
  url.username = "";
  url.password = "";
  if (url.pathname === "") url.pathname = "/";
  return {
    url: url.toString(),
    normalizedDomain: url.hostname.replace(/^www\./i, "").toLowerCase(),
  };
}

function normalizeDiscoveredUrl(href: string, baseUrl: string): string | null {
  try {
    if (!href || href.startsWith("#")) return null;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return null;
    const url = new URL(href, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sameDomain(a: string, b: string): boolean {
  try {
    const ah = new URL(a).hostname.replace(/^www\./i, "").toLowerCase();
    const bh = new URL(b).hostname.replace(/^www\./i, "").toLowerCase();
    return ah === bh;
  } catch {
    return false;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function redactContactDetails(text: string): string {
  return text.replace(EMAIL_RE, "[email redacted]").replace(PHONE_RE, "[phone redacted]");
}

function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return stripHtml(og[1]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title?.[1] ? stripHtml(title[1]) : null;
}

function classifyPage(url: string, title: string | null, text: string): VenueImportPageType {
  const haystack = `${url} ${title || ""} ${text.slice(0, 500)}`.toLowerCase();
  if (/gallery|photos|images/.test(haystack)) return "gallery";
  if (/pricing|prices|rates|tariff/.test(haystack)) return "pricing";
  if (/contact|directions|location/.test(haystack)) return "contact";
  if (/terms|conditions|rules|policy/.test(haystack)) return "terms";
  if (/rooms?|spaces?|venues?|halls?|facilities|conference|wedding|function/.test(haystack)) {
    return "space";
  }
  try {
    return new URL(url).pathname === "/" ? "home" : "unknown";
  } catch {
    return "unknown";
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const url = normalizeDiscoveredUrl(match[1], baseUrl);
    if (!url || !sameDomain(url, baseUrl)) continue;
    const path = new URL(url).pathname.toLowerCase();
    if (SKIP_PATH_RE.test(path)) continue;
    links.add(url);
  }
  return [...links].sort((a, b) => {
    const ar = RELEVANT_PATH_RE.test(a) ? 0 : 1;
    const br = RELEVANT_PATH_RE.test(b) ? 0 : 1;
    return ar - br || a.localeCompare(b);
  });
}

function extractImages(html: string, pageUrl: string): ExtractedImageCandidate[] {
  const images: ExtractedImageCandidate[] = [];
  const re = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const imageUrl = normalizeDiscoveredUrl(match[1], pageUrl);
    if (!imageUrl) continue;
    if (/logo|icon|sprite|favicon/i.test(imageUrl)) continue;
    const tag = match[0];
    const alt = tag.match(/\salt=["']([^"']*)["']/i)?.[1] || null;
    images.push({
      candidate_type: "property",
      image_url: imageUrl,
      alt_text: alt,
      source_url: pageUrl,
      selected: false,
      confidence_score: RELEVANT_PATH_RE.test(imageUrl) ? 0.55 : 0.4,
    });
  }
  return images.slice(0, 40);
}

export async function crawlVenueWebsite(input: {
  sourceUrl: string;
  maxPages?: number;
  crawlDepth?: number;
  includeImages?: boolean;
}): Promise<{ pages: CrawledPage[]; images: ExtractedImageCandidate[]; normalizedDomain: string }> {
  const start = normalizeVenueImportUrl(input.sourceUrl);
  const maxPages = Math.min(
    Math.max(1, input.maxPages ?? VENUE_IMPORT_DEFAULT_MAX_PAGES),
    VENUE_IMPORT_MAX_PAGES
  );
  const crawlDepth = Math.min(
    Math.max(0, input.crawlDepth ?? VENUE_IMPORT_DEFAULT_CRAWL_DEPTH),
    VENUE_IMPORT_MAX_DEPTH
  );
  const queue: { url: string; depth: number }[] = [{ url: start.url, depth: 0 }];
  const seenUrls = new Set<string>();
  const seenHashes = new Set<string>();
  const pages: CrawledPage[] = [];
  const images: ExtractedImageCandidate[] = [];

  while (queue.length && pages.length < maxPages) {
    const current = queue.shift();
    if (!current || seenUrls.has(current.url)) continue;
    seenUrls.add(current.url);
    if (!sameDomain(current.url, start.url)) continue;

    let statusCode: number | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), VENUE_IMPORT_FETCH_TIMEOUT_MS);
      const response = await fetch(current.url, {
        signal: controller.signal,
        headers: { "User-Agent": "FindMySpace Venue Scout Import" },
      });
      clearTimeout(timeout);
      statusCode = response.status;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        pages.push({
          url: current.url,
          title: null,
          status_code: statusCode,
          content_hash: null,
          extracted_text: null,
          page_type: "unknown",
        });
        continue;
      }
      const html = (await response.text()).slice(0, VENUE_IMPORT_MAX_HTML_BYTES);
      const text = redactContactDetails(stripHtml(html)).slice(0, 12000);
      const contentHash = crypto.createHash("sha256").update(text).digest("hex");
      if (seenHashes.has(contentHash)) continue;
      seenHashes.add(contentHash);

      const title = extractTitle(html);
      const page_type = classifyPage(current.url, title, text);
      pages.push({
        url: current.url,
        title,
        status_code: statusCode,
        content_hash: contentHash,
        extracted_text: text,
        page_type,
        html,
      });

      if (input.includeImages !== false) {
        images.push(...extractImages(html, current.url));
      }

      if (current.depth < crawlDepth) {
        for (const link of extractLinks(html, current.url)) {
          if (!seenUrls.has(link) && queue.length + pages.length < maxPages * 2) {
            queue.push({ url: link, depth: current.depth + 1 });
          }
        }
      }
    } catch {
      pages.push({
        url: current.url,
        title: null,
        status_code: statusCode,
        content_hash: null,
        extracted_text: null,
        page_type: "unknown",
      });
    }
  }

  return {
    pages,
    images: dedupeImages(images),
    normalizedDomain: start.normalizedDomain,
  };
}

function dedupeImages(images: ExtractedImageCandidate[]): ExtractedImageCandidate[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.image_url)) return false;
    seen.add(image.image_url);
    return true;
  });
}

function firstSentence(text: string, max = 420): string | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max).replace(/\s+\S*$/, "").trim();
}

function parsePrice(text: string): { amount: number | null; unit: string | null } {
  const match = text.match(PRICE_RE);
  if (!match?.[1]) return { amount: null, unit: null };
  const amount = Number(match[1].replace(/[\s,]/g, ""));
  if (!Number.isFinite(amount)) return { amount: null, unit: null };
  const lower = text.toLowerCase();
  const unit = lower.includes("per hour")
    ? "hour"
    : lower.includes("per month")
      ? "month"
      : lower.includes("per event") || lower.includes("function")
        ? "event"
        : "day";
  return { amount, unit };
}

function parseCapacity(text: string): number | null {
  const match = text.match(CAPACITY_RE);
  if (!match?.[1]) return null;
  const capacity = Number(match[1]);
  return Number.isFinite(capacity) ? capacity : null;
}

function inferSpaceType(name: string, text: string): string {
  const lower = `${name} ${text}`.toLowerCase();
  if (/field|court|sport|clubhouse/.test(lower)) return "sport_venue";
  if (/parking/.test(lower)) return "parking";
  if (/storage/.test(lower)) return "storage";
  if (/office|boardroom|conference|classroom/.test(lower)) return "workspace";
  return "event_space";
}

function extractAmenities(text: string): string[] {
  const amenities = [
    "parking",
    "wifi",
    "kitchen",
    "bar",
    "toilets",
    "security",
    "projector",
    "sound",
    "catering",
    "braai",
    "garden",
  ];
  const lower = text.toLowerCase();
  return amenities.filter((item) => lower.includes(item));
}

export function extractVenueCandidates(input: {
  sourceUrl: string;
  pages: CrawledPage[];
  images: ExtractedImageCandidate[];
}): VenueImportExtraction {
  const successfulPages = input.pages.filter((page) => page.extracted_text);
  const home = successfulPages.find((page) => page.page_type === "home") || successfulPages[0];
  const combinedText = successfulPages.map((page) => page.extracted_text || "").join("\n\n");
  const sourceUrls = successfulPages.map((page) => page.url);
  const propertyName =
    home?.title?.replace(/\s+[|-]\s+.*$/, "").trim() ||
    new URL(input.sourceUrl).hostname.replace(/^www\./, "");
  const description = firstSentence(home?.extracted_text || combinedText, 650);
  const addressSource =
    successfulPages.find((page) => page.page_type === "contact")?.extracted_text || combinedText;
  const addressMatch = addressSource.match(
    /\b(\d{1,5}\s+[A-Za-z0-9 ,.'-]{8,120}(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Way|Farm|Estate)[A-Za-z0-9 ,.'-]*)/i
  );

  const property = {
    name: propertyName,
    description,
    address: addressMatch?.[1] || null,
    country: "South Africa",
    website_url: input.sourceUrl,
    source_urls: sourceUrls.slice(0, 10),
    confidence_score: propertyName ? 0.72 : 0.45,
    raw_payload: {
      extraction: "heuristic",
      contact_details_redacted: true,
    },
  };

  const spaceByName = new Map<string, Record<string, unknown>>();
  for (const page of successfulPages) {
    const text = page.extracted_text || "";
    const names = new Set<string>();
    if (page.page_type === "space" && page.title) names.add(page.title.replace(/\s+[|-]\s+.*$/, ""));
    let match: RegExpExecArray | null;
    while ((match = SPACE_NAME_RE.exec(text))) names.add(match[1].trim());

    for (const name of [...names].slice(0, 8)) {
      if (!name || name.length < 3) continue;
      const key = name.toLowerCase();
      if (spaceByName.has(key)) continue;
      const capacity = parseCapacity(text);
      const price = parsePrice(text);
      const missing = [
        capacity ? null : "capacity",
        price.amount ? null : "pricing",
        description ? null : "description",
      ].filter(Boolean) as string[];

      spaceByName.set(key, {
        name,
        description: firstSentence(text, 700),
        space_type: inferSpaceType(name, text),
        min_group_size: null,
        max_group_size: capacity,
        price_amount: price.amount,
        price_unit: price.unit,
        booking_unit: price.unit === "hour" || price.unit === "month" ? price.unit : "day",
        deposit_amount: null,
        amenities: extractAmenities(text),
        features: {},
        booking_requirements: null,
        terms_notes:
          page.page_type === "terms" ? firstSentence(text, 500) : null,
        source_urls: [page.url],
        confidence_score: capacity ? 0.68 : 0.48,
        missing_fields: missing,
        selected_for_creation: true,
        raw_payload: {
          extraction: "heuristic",
          possible_space: !/(hall|room|field|court|venue|clubhouse|garden|boardroom|classroom)/i.test(name),
          contact_details_redacted: true,
        },
      });
    }
  }

  if (spaceByName.size === 0 && propertyName) {
    spaceByName.set(propertyName.toLowerCase(), {
      name: propertyName,
      description,
      space_type: "event_space",
      booking_unit: "day",
      price_amount: null,
      price_unit: null,
      amenities: extractAmenities(combinedText),
      source_urls: sourceUrls.slice(0, 3),
      confidence_score: 0.35,
      missing_fields: ["space confirmation", "capacity", "pricing"],
      selected_for_creation: false,
      raw_payload: {
        extraction: "heuristic",
        possible_space: true,
        contact_details_redacted: true,
      },
    });
  }

  const spaces = [...spaceByName.values()].slice(0, 12);
  return {
    property,
    spaces,
    images: input.images.slice(0, 40),
    summary: `Crawled ${input.pages.length} page(s), extracted 1 property candidate and ${spaces.length} possible space candidate(s).`,
    confidence: spaces.length > 1 ? 0.62 : 0.48,
  };
}

export async function storeVenueImportResults(input: {
  admin: SupabaseClient;
  jobId: string;
  pages: CrawledPage[];
  extraction: VenueImportExtraction;
}) {
  const admin = input.admin;
  await admin.from("venue_import_pages").insert(
    input.pages.map((page) => ({
      job_id: input.jobId,
      url: page.url,
      title: page.title,
      status_code: page.status_code,
      content_hash: page.content_hash,
      extracted_text: page.extracted_text,
      page_type: page.page_type,
    }))
  );

  const { data: propertyCandidate, error: propertyErr } = await admin
    .from("venue_import_property_candidates")
    .insert({ job_id: input.jobId, ...input.extraction.property })
    .select("id")
    .single();
  if (propertyErr || !propertyCandidate) throw new Error(propertyErr?.message || "Could not store property candidate.");

  const propertyCandidateId = (propertyCandidate as { id: string }).id;
  const spaces = input.extraction.spaces.map((space) => ({
    job_id: input.jobId,
    property_candidate_id: propertyCandidateId,
    ...space,
  }));
  const { data: spaceCandidates, error: spacesErr } = spaces.length
    ? await admin
        .from("venue_import_space_candidates")
        .insert(spaces)
        .select("id, name")
    : { data: [], error: null };
  if (spacesErr) throw new Error(spacesErr.message);

  const firstSpaceId = (spaceCandidates?.[0] as { id?: string } | undefined)?.id ?? null;
  const imageRows = input.extraction.images.map((image) => ({
    job_id: input.jobId,
    candidate_type: firstSpaceId ? "space" : "property",
    candidate_id: firstSpaceId ?? propertyCandidateId,
    image_url: image.image_url,
    alt_text: image.alt_text ?? null,
    source_url: image.source_url ?? null,
    selected: false,
    confidence_score: image.confidence_score ?? null,
  }));
  if (imageRows.length) {
    const { error: imageErr } = await admin
      .from("venue_import_image_candidates")
      .insert(imageRows);
    if (imageErr) throw new Error(imageErr.message);
  }
}

function candidateToPublicDescription(description: string | null, sourceUrl: string): string {
  const clean = redactContactDetails(description || "").trim();
  const notes = `\n\nImported from Venue Scout staging. Source: ${sourceUrl}. Review all details before publishing.`;
  return `${clean || "Venue Scout imported listing. Details require review."}${notes}`;
}

export function mapSpaceCandidateToUnclaimedInput(input: {
  candidate: Record<string, unknown>;
  property: Record<string, unknown> | null;
  sourceUrl: string;
}): Record<string, unknown> {
  const c = input.candidate;
  const p = input.property;
  const priceUnit =
    typeof c.price_unit === "string" && ["hour", "day", "month", "event"].includes(c.price_unit)
      ? c.price_unit
      : "on_request";
  const payload: Record<string, unknown> = {
    title: c.name || "Untitled space",
    description: candidateToPublicDescription(
      typeof c.description === "string" ? c.description : null,
      input.sourceUrl
    ),
    space_type: c.space_type || "event_space",
    booking_unit:
      c.booking_unit === "hour" || c.booking_unit === "month" ? c.booking_unit : "day",
    city: p?.city ?? null,
    suburb: p?.suburb ?? null,
    street_address: p?.address ?? null,
    address_line_1: p?.address ?? null,
    province: p?.province ?? null,
    postal_code: p?.postal_code ?? null,
    country: p?.country ?? "South Africa",
    latitude: p?.latitude ?? null,
    longitude: p?.longitude ?? null,
    min_group_size: c.min_group_size ?? null,
    max_group_size: c.max_group_size ?? null,
    price_unit: priceUnit,
    price_amount: priceUnit === "on_request" ? null : c.price_amount ?? null,
    deposit_required: false,
    deposit_amount: null,
    attributes: {
      amenities: Array.isArray(c.amenities) ? c.amenities : [],
    },
  };
  return payload;
}

export async function createSpaceFromCandidate(input: {
  admin: SupabaseClient;
  candidate: Record<string, unknown>;
  property: Record<string, unknown> | null;
  sourceUrl: string;
  adminUserId: string;
  propertyId?: string | null;
  status?: AdminUnclaimedStatus;
}) {
  const payload = mapSpaceCandidateToUnclaimedInput({
    candidate: input.candidate,
    property: input.property,
    sourceUrl: input.sourceUrl,
  });
  const parsed = parseUnclaimedSpaceInput(payload);
  if (!parsed.ok) throw new Error(parsed.error);
  const row = buildUnclaimedSpaceRow(parsed.data, input.adminUserId, input.status ?? "draft", {
    propertyId: input.propertyId ?? null,
  });
  const { data, error } = await input.admin
    .from("spaces")
    .insert(row)
    .select("id, title, status, property_id")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create space.");
  const attrErr = await syncSpaceAttributes(input.admin, (data as { id: string }).id, parsed.data.attributes);
  if (attrErr) throw new Error(attrErr);
  return data as { id: string; title: string; status: string; property_id: string | null };
}

export async function createPropertyFromCandidate(input: {
  admin: SupabaseClient;
  property: Record<string, unknown>;
  adminUserId: string;
}) {
  const row = buildPropertyRow(
    {
      name: (input.property.name as string | null) || "Untitled property",
      description: (input.property.description as string | null) || null,
      address_line1: (input.property.address as string | null) || null,
      suburb: (input.property.suburb as string | null) || null,
      city: (input.property.city as string | null) || null,
      province: (input.property.province as string | null) || null,
      postal_code: (input.property.postal_code as string | null) || null,
      country: (input.property.country as string | null) || "South Africa",
      latitude: (input.property.latitude as number | null) || null,
      longitude: (input.property.longitude as number | null) || null,
    },
    input.adminUserId
  );
  const { data, error } = await input.admin
    .from("properties")
    .insert(row)
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create property.");
  return data as { id: string; name: string };
}
