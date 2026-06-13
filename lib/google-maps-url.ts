export type GoogleMapsCoordinates = {
  lat: number;
  lng: number;
};

function parseCoordinatePair(raw: string): GoogleMapsCoordinates | null {
  const decoded = decodeURIComponent(raw.replace(/\+/g, " ")).trim();
  const match = decoded.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function normalizeUrlInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getUrlHostname(value: string): string | null {
  try {
    return new URL(normalizeUrlInput(value)).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Whether the pasted value looks like a Google Maps URL. */
export function isGoogleMapsUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const host = getUrlHostname(trimmed);
  if (host) {
    return (
      host === "maps.google.com" ||
      host === "maps.app.goo.gl" ||
      (host === "google.com" && /\/maps/i.test(trimmed)) ||
      (host === "goo.gl" && /\/maps/i.test(trimmed))
    );
  }

  return /maps\.(google|app\.goo)/i.test(trimmed) || /google\.com\/maps/i.test(trimmed);
}

/** Short links that require server-side redirect resolution. */
export function isShortGoogleMapsUrl(value: string): boolean {
  const host = getUrlHostname(value);
  if (!host) return false;
  return host === "maps.app.goo.gl" || (host === "goo.gl" && /\/maps/i.test(value));
}

/** Try to extract lat/lng from a full Google Maps URL. */
export function extractGoogleMapsCoordinates(value: string): GoogleMapsCoordinates | null {
  const raw = value.trim();
  if (!raw) return null;

  const atMatch = raw.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const coords = parseCoordinatePair(`${atMatch[1]},${atMatch[2]}`);
    if (coords) return coords;
  }

  const d3 = raw.match(/!3d(-?\d+(?:\.\d+)?)/);
  const d4 = raw.match(/!4d(-?\d+(?:\.\d+)?)/);
  if (d3 && d4) {
    const coords = parseCoordinatePair(`${d3[1]},${d4[1]}`);
    if (coords) return coords;
  }

  try {
    const url = new URL(normalizeUrlInput(raw));
    for (const key of ["q", "ll", "query", "center"]) {
      const param = url.searchParams.get(key);
      if (!param) continue;
      const coords = parseCoordinatePair(param);
      if (coords) return coords;
    }

    const pathCoords = url.pathname.match(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (pathCoords) {
      const coords = parseCoordinatePair(`${pathCoords[1]},${pathCoords[2]}`);
      if (coords) return coords;
    }
  } catch {
    return null;
  }

  return null;
}

/** Extract a human-readable place/search string when coordinates are absent. */
export function extractGoogleMapsSearchQuery(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  try {
    const url = new URL(normalizeUrlInput(raw));

    const placeMatch = url.pathname.match(/\/maps\/place\/([^/@?]+)/);
    if (placeMatch) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
    }

    const searchMatch = url.pathname.match(/\/maps\/search\/([^/@?]+)/);
    if (searchMatch) {
      return decodeURIComponent(searchMatch[1].replace(/\+/g, " "));
    }

    for (const key of ["q", "query"]) {
      const param = url.searchParams.get(key);
      if (!param) continue;
      const coords = parseCoordinatePair(param);
      if (!coords) {
        return decodeURIComponent(param).replace(/\+/g, " ");
      }
    }
  } catch {
    return null;
  }

  return null;
}

/** Parse a Google Maps URL locally, or indicate that server resolution is needed. */
export function parseGoogleMapsUrl(value: string): {
  coordinates: GoogleMapsCoordinates | null;
  searchQuery: string | null;
  needsResolve: boolean;
} {
  if (!isGoogleMapsUrl(value)) {
    return { coordinates: null, searchQuery: null, needsResolve: false };
  }

  if (isShortGoogleMapsUrl(value)) {
    return { coordinates: null, searchQuery: null, needsResolve: true };
  }

  return {
    coordinates: extractGoogleMapsCoordinates(value),
    searchQuery: extractGoogleMapsSearchQuery(value),
    needsResolve: false,
  };
}
