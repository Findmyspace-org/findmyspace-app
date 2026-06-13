import {
  isGoogleMapsUrl,
  isShortGoogleMapsUrl,
  parseGoogleMapsUrl,
  type GoogleMapsCoordinates,
} from "@/lib/google-maps-url";

export const GOOGLE_MAPS_PARSE_ERROR =
  "We could not read this Google Maps link. Try searching the address manually.";

export const GOOGLE_MAPS_SHORT_URL_ERROR =
  "Open the shortened link in your browser and copy the full Google Maps URL from the address bar.";

export type GoogleMapsUrlApplyError =
  | "not_google_maps"
  | "unparseable"
  | "short_url_unresolved";

export type ResolvedGoogleMapsUrl = {
  coordinates: GoogleMapsCoordinates | null;
  searchQuery: string | null;
};

type ResolveUrlFetchResult = {
  resolvedUrl?: string;
  coordinates?: GoogleMapsCoordinates | null;
  searchQuery?: string | null;
};

/** Parse a Google Maps URL locally, resolving shortened links via the provided fetcher. */
export async function resolveGoogleMapsUrlClient(
  raw: string,
  fetchResolved: (url: string) => Promise<ResolveUrlFetchResult>
): Promise<
  | { ok: true; data: ResolvedGoogleMapsUrl }
  | { ok: false; error: GoogleMapsUrlApplyError }
> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "unparseable" };
  }

  if (!isGoogleMapsUrl(trimmed)) {
    return { ok: false, error: "not_google_maps" };
  }

  let parsed = parseGoogleMapsUrl(trimmed);

  if (parsed.needsResolve || isShortGoogleMapsUrl(trimmed)) {
    try {
      const resolved = await fetchResolved(trimmed);
      const resolvedUrl = resolved.resolvedUrl || trimmed;
      parsed = parseGoogleMapsUrl(resolvedUrl);
      if (!parsed.coordinates && !parsed.searchQuery) {
        return {
          ok: true,
          data: {
            coordinates: resolved.coordinates ?? null,
            searchQuery: resolved.searchQuery ?? null,
          },
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (
        message.includes("short_url_unresolved") ||
        message.includes("full Google Maps URL")
      ) {
        return { ok: false, error: "short_url_unresolved" };
      }
      return { ok: false, error: "unparseable" };
    }
  }

  return {
    ok: true,
    data: {
      coordinates: parsed.coordinates,
      searchQuery: parsed.searchQuery,
    },
  };
}

export function googleMapsUrlErrorMessage(error: GoogleMapsUrlApplyError): string {
  if (error === "short_url_unresolved") {
    return GOOGLE_MAPS_SHORT_URL_ERROR;
  }
  return GOOGLE_MAPS_PARSE_ERROR;
}
