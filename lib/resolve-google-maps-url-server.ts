import {
  extractGoogleMapsCoordinates,
  extractGoogleMapsSearchQuery,
  isGoogleMapsUrl,
  isShortGoogleMapsUrl,
} from "@/lib/google-maps-url";

export type ResolveGoogleMapsUrlServerResult =
  | {
      ok: true;
      resolvedUrl: string;
      coordinates: ReturnType<typeof extractGoogleMapsCoordinates>;
      searchQuery: ReturnType<typeof extractGoogleMapsSearchQuery>;
    }
  | {
      ok: false;
      status: 400 | 422;
      error: string;
      message?: string;
    };

/** Resolve shortened Google Maps URLs and extract coordinates / search query. */
export async function resolveGoogleMapsUrlServer(
  urlParam: string
): Promise<ResolveGoogleMapsUrlServerResult> {
  if (!isGoogleMapsUrl(urlParam)) {
    return { ok: false, status: 400, error: "Not a Google Maps URL." };
  }

  let resolvedUrl = urlParam;

  if (isShortGoogleMapsUrl(urlParam)) {
    try {
      const response = await fetch(urlParam, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "FindMySpace/1.0 (maps resolve)",
        },
      });
      resolvedUrl = response.url || urlParam;
    } catch (err) {
      console.error("[resolve-google-maps-url]", err);
      return {
        ok: false,
        status: 422,
        error: "short_url_unresolved",
        message:
          "Open the link in your browser and copy the full Google Maps URL from the address bar.",
      };
    }
  }

  return {
    ok: true,
    resolvedUrl,
    coordinates: extractGoogleMapsCoordinates(resolvedUrl),
    searchQuery: extractGoogleMapsSearchQuery(resolvedUrl),
  };
}
