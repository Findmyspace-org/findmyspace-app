"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { buildAddressQuery, type GeocodedAddress } from "@/lib/geocoding";
import {
  googleMapsUrlErrorMessage,
  resolveGoogleMapsUrlClient,
} from "@/lib/google-maps-url-apply-client";
import { isGoogleMapsUrl } from "@/lib/google-maps-url";
import { ZA_PROVINCES } from "@/lib/za-provinces";

const MapPicker = dynamic(() => import("@/app/components/MapPicker"), {
  ssr: false,
});

/** Paarl town centre — default for new admin unclaimed listings without coordinates. */
const DEFAULT_LAT = -33.7342;
const DEFAULT_LNG = 18.962;
const DEFAULT_ZOOM = 14;

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]";

export type AdminLocationValue = {
  streetAddress: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
};

type AdminLocationSectionProps = {
  value: AdminLocationValue;
  readOnly?: boolean;
  onChange: (patch: Partial<AdminLocationValue>) => void;
};

function applyGeocodedAddress(
  current: AdminLocationValue,
  result: GeocodedAddress,
  forcePopulate: boolean
): Partial<AdminLocationValue> {
  const patch: Partial<AdminLocationValue> = {
    latitude: result.latitude,
    longitude: result.longitude,
  };

  if (forcePopulate || !current.streetAddress.trim()) {
    patch.streetAddress = result.streetAddress || current.streetAddress;
  }
  if (forcePopulate || !current.suburb.trim()) {
    patch.suburb = result.suburb || current.suburb;
  }
  if (forcePopulate || !current.city.trim()) {
    patch.city = result.city || current.city;
  }
  if (forcePopulate || !current.province.trim()) {
    patch.province = result.province || current.province;
  }
  if (forcePopulate || !current.postalCode.trim()) {
    patch.postalCode = result.postalCode || current.postalCode;
  }
  if (result.country) {
    patch.country = result.country;
  }

  return patch;
}

export function AdminLocationSection({
  value,
  readOnly = false,
  onChange,
}: AdminLocationSectionProps) {
  const [suggestions, setSuggestions] = useState<GeocodedAddress[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [pinSuggestions, setPinSuggestions] = useState<GeocodedAddress[]>([]);
  const [searching, setSearching] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [mapsUrl, setMapsUrl] = useState("");
  const [mapsUrlLoading, setMapsUrlLoading] = useState(false);
  const suggestionAbortRef = useRef<AbortController | null>(null);
  const reverseGeocodeAbortRef = useRef<AbortController | null>(null);
  const reverseGeocodeRequestIdRef = useRef(0);
  const valueRef = useRef(value);
  const skipAutocompleteRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const hasPin =
    value.latitude !== null &&
    value.longitude !== null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude);

  const mapLat = hasPin ? value.latitude! : DEFAULT_LAT;
  const mapLng = hasPin ? value.longitude! : DEFAULT_LNG;

  const clearPinSuggestionState = useCallback(() => {
    setPinSuggestions([]);
  }, []);

  const clearAddressSuggestionState = useCallback(() => {
    suggestionAbortRef.current?.abort();
    suggestionAbortRef.current = null;
    setSuggestions([]);
    setSuggestionsOpen(false);
  }, []);

  useEffect(() => {
    if (readOnly) return;
    if (skipAutocompleteRef.current) {
      skipAutocompleteRef.current = false;
      return;
    }

    const query = buildAddressQuery({
      streetAddress: value.streetAddress,
      suburb: value.suburb,
      city: value.city,
      province: value.province,
      country: value.country,
    });

    if (query.trim().length < 3) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        suggestionAbortRef.current?.abort();
        const controller = new AbortController();
        suggestionAbortRef.current = controller;

        const result = await adminApiFetch(
          `/api/admin/geocode?q=${encodeURIComponent(query)}&limit=5`,
          { signal: controller.signal }
        );
        const next = (result.results as GeocodedAddress[]) || [];
        setSuggestions(next);
        setSuggestionsOpen(next.length > 0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Address autocomplete failed", error);
        }
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [
    readOnly,
    value.streetAddress,
    value.suburb,
    value.city,
    value.province,
    value.country,
  ]);

  const selectSuggestion = useCallback(
    (result: GeocodedAddress) => {
      onChange(applyGeocodedAddress(valueRef.current, result, true));
      clearAddressSuggestionState();
      clearPinSuggestionState();
      setGeoMessage("Address selected. Pin placed on map.");
    },
    [clearAddressSuggestionState, clearPinSuggestionState, onChange]
  );

  const selectPinSuggestion = useCallback(
    (result: GeocodedAddress) => {
      onChange(applyGeocodedAddress(valueRef.current, result, true));
      clearPinSuggestionState();
      setGeoMessage("Location selected from map.");
    },
    [clearPinSuggestionState, onChange]
  );

  async function geocodeSearchQuery(query: string, successMessage: string) {
    const result = await adminApiFetch(
      `/api/admin/geocode?q=${encodeURIComponent(query)}&limit=1`
    );
    const matches = (result.results as GeocodedAddress[]) || [];
    if (matches.length === 0) {
      setGeoMessage(
        "We could not read this Google Maps link. Try searching the address manually."
      );
      return false;
    }

    skipAutocompleteRef.current = true;
    onChange(applyGeocodedAddress(valueRef.current, matches[0], true));
    clearAddressSuggestionState();
    clearPinSuggestionState();
    setGeoMessage(successMessage);
    return true;
  }

  async function applyCoordinatesFromMapsLink(
    lat: number,
    lng: number,
    successMessage: string
  ) {
    reverseGeocodeRequestIdRef.current += 1;
    const requestId = reverseGeocodeRequestIdRef.current;

    clearAddressSuggestionState();
    clearPinSuggestionState();
    reverseGeocodeAbortRef.current?.abort();
    reverseGeocodeAbortRef.current = null;

    onChange({ latitude: lat, longitude: lng });
    setGeoMessage(successMessage);
    await reverseGeocodePin(lat, lng, requestId);
  }

  async function applyGoogleMapsUrl(rawInput?: string) {
    const raw = (rawInput ?? mapsUrl).trim();
    if (!raw || readOnly) return;

    if (!isGoogleMapsUrl(raw)) {
      setGeoMessage(googleMapsUrlErrorMessage("not_google_maps"));
      return;
    }

    setMapsUrlLoading(true);
    setGeoMessage(null);

    try {
      const resolved = await resolveGoogleMapsUrlClient(raw, (url) =>
        adminApiFetch(`/api/admin/maps/resolve-url?url=${encodeURIComponent(url)}`)
      );

      if (!resolved.ok) {
        setGeoMessage(googleMapsUrlErrorMessage(resolved.error));
        return;
      }

      const { coordinates, searchQuery } = resolved.data;

      if (coordinates) {
        await applyCoordinatesFromMapsLink(
          coordinates.lat,
          coordinates.lng,
          "Location placed from Google Maps link."
        );
        return;
      }

      if (searchQuery) {
        await geocodeSearchQuery(
          searchQuery,
          "Address found from Google Maps link."
        );
        return;
      }

      setGeoMessage(googleMapsUrlErrorMessage("unparseable"));
    } catch {
      setGeoMessage(googleMapsUrlErrorMessage("unparseable"));
    } finally {
      setMapsUrlLoading(false);
    }
  }

  async function findAddressOnMap() {
    const query = buildAddressQuery({
      streetAddress: value.streetAddress,
      suburb: value.suburb,
      city: value.city,
      province: value.province,
      country: value.country,
    });

    if (!query) {
      setGeoMessage("Enter an address, suburb, or city first.");
      return;
    }

    setSearching(true);
    setGeoMessage(null);
    clearPinSuggestionState();
    try {
      const result = await adminApiFetch(
        `/api/admin/geocode?q=${encodeURIComponent(query)}&limit=1`
      );
      const matches = (result.results as GeocodedAddress[]) || [];
      if (matches.length === 0) {
        setGeoMessage(
          "We could not find this address. Please move the pin manually."
        );
        return;
      }

      skipAutocompleteRef.current = true;
      onChange(applyGeocodedAddress(valueRef.current, matches[0], true));
      setGeoMessage("Address found. Pin placed on map.");
    } catch (err) {
      setGeoMessage(
        err instanceof Error ? err.message : "Could not search for the address."
      );
    } finally {
      setSearching(false);
    }
  }

  const reverseGeocodePin = useCallback(
    async (lat: number, lng: number, requestId: number) => {
      reverseGeocodeAbortRef.current?.abort();
      const controller = new AbortController();
      reverseGeocodeAbortRef.current = controller;

      setReverseGeocoding(true);
      try {
        const result = await adminApiFetch(
          `/api/admin/geocode?lat=${lat}&lng=${lng}`,
          { signal: controller.signal }
        );

        if (reverseGeocodeRequestIdRef.current !== requestId) return;

        const geocoded = result.result as GeocodedAddress | undefined;
        if (geocoded) {
          skipAutocompleteRef.current = true;
          onChange(
            applyGeocodedAddress(
              { ...valueRef.current, latitude: lat, longitude: lng },
              geocoded,
              false
            )
          );

          const searchQuery =
            geocoded.label?.trim() ||
            buildAddressQuery({
              streetAddress: geocoded.streetAddress,
              suburb: geocoded.suburb,
              city: geocoded.city,
              province: geocoded.province,
              country: geocoded.country,
            });

          if (searchQuery.length >= 3) {
            try {
              const nearby = await adminApiFetch(
                `/api/admin/geocode?q=${encodeURIComponent(searchQuery)}&limit=5`,
                { signal: controller.signal }
              );
              if (reverseGeocodeRequestIdRef.current !== requestId) return;
              const options = (nearby.results as GeocodedAddress[]) || [];
              setPinSuggestions(options.length > 0 ? options : [geocoded]);
            } catch (nearbyErr) {
              if ((nearbyErr as Error).name === "AbortError") return;
              setPinSuggestions([geocoded]);
            }
          } else {
            setPinSuggestions([geocoded]);
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("Reverse geocoding failed", err);
      } finally {
        if (reverseGeocodeRequestIdRef.current === requestId) {
          setReverseGeocoding(false);
        }
      }
    },
    [onChange]
  );

  const handleMapPinChange = useCallback(
    (lat: number, lng: number) => {
      if (readOnly) return;

      reverseGeocodeRequestIdRef.current += 1;
      const requestId = reverseGeocodeRequestIdRef.current;

      clearAddressSuggestionState();
      clearPinSuggestionState();
      reverseGeocodeAbortRef.current?.abort();
      reverseGeocodeAbortRef.current = null;

      onChange({ latitude: lat, longitude: lng });
      setGeoMessage(`Pin placed at ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      void reverseGeocodePin(lat, lng, requestId);
    },
    [
      clearAddressSuggestionState,
      clearPinSuggestionState,
      onChange,
      readOnly,
      reverseGeocodePin,
    ]
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Location</h2>
      <p className="mt-1 text-sm text-gray-600">
        Start typing the address, then choose a result to place the pin.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="relative block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Street address
          </span>
          <input
            value={value.streetAddress}
            disabled={readOnly}
            onChange={(e) => {
              onChange({ streetAddress: e.target.value });
              setSuggestionsOpen(true);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setSuggestionsOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setSuggestionsOpen(false), 140);
            }}
            placeholder="e.g. 42 Main Street"
            className={FIELD_CLASS}
            autoComplete="street-address"
          />
          {!readOnly && suggestionsOpen && suggestions.length > 0 ? (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={`addr-${suggestion.latitude}-${suggestion.longitude}-${idx}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(suggestion);
                  }}
                  className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 last:border-b-0"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Suburb</span>
          <input
            value={value.suburb}
            disabled={readOnly}
            onChange={(e) => onChange({ suburb: e.target.value })}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">City</span>
          <input
            value={value.city}
            disabled={readOnly}
            onChange={(e) => onChange({ city: e.target.value })}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Province</span>
          <select
            value={value.province}
            disabled={readOnly}
            onChange={(e) => onChange({ province: e.target.value })}
            className={FIELD_CLASS}
          >
            <option value="">Select province</option>
            {ZA_PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Postal code
          </span>
          <input
            value={value.postalCode}
            disabled={readOnly}
            onChange={(e) => onChange({ postalCode: e.target.value })}
            className={FIELD_CLASS}
          />
        </label>
      </div>

      {!readOnly ? (
        <>
          <label className="mt-4 block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Google Maps link
            </span>
            <input
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (!pasted.trim()) return;
                window.setTimeout(() => {
                  void applyGoogleMapsUrl(pasted);
                }, 0);
              }}
              onBlur={() => {
                if (mapsUrl.trim()) void applyGoogleMapsUrl();
              }}
              placeholder="Paste a Google Maps link or share URL"
              className={FIELD_CLASS}
            />
            <p className="mt-1 text-xs text-gray-500">
              Paste a Google Maps location link to place the pin automatically.
            </p>
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void findAddressOnMap()}
              disabled={searching || reverseGeocoding || mapsUrlLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              {searching ? "Finding…" : "Find address on map"}
            </button>
            {mapsUrlLoading ? (
              <span className="inline-flex items-center gap-2 px-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading Google Maps link…
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {geoMessage ? (
        <p
          className={`mt-3 text-sm ${
            geoMessage.includes("could not find") ||
            geoMessage.includes("Enter an address")
              ? "text-amber-800"
              : "text-green-700"
          }`}
        >
          {geoMessage}
        </p>
      ) : null}

      <div className="mt-4">
        <MapPicker
          latitude={mapLat}
          longitude={mapLng}
          zoom={DEFAULT_ZOOM}
          onChange={handleMapPinChange}
        />
        {hasPin ? (
          <p className="mt-2 text-sm text-gray-700">
            Pin at {value.latitude!.toFixed(6)}, {value.longitude!.toFixed(6)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-800">
            Map centred on Paarl. Search for an address or move the pin.
          </p>
        )}
        {reverseGeocoding ? (
          <p className="mt-1 text-xs text-gray-500">Updating address from map pin…</p>
        ) : null}
        {!readOnly && pinSuggestions.length > 0 ? (
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-2">
            <p className="mb-2 px-1 text-xs font-medium text-gray-600">
              Choose the best match for this pin
            </p>
            <ul className="max-h-48 space-y-1 overflow-auto">
              {pinSuggestions.map((suggestion, idx) => (
                <li key={`pin-${suggestion.latitude}-${suggestion.longitude}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => selectPinSuggestion(suggestion)}
                    className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-left text-sm text-gray-700 hover:border-gray-200 hover:bg-gray-50"
                  >
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!readOnly ? (
          <p className="mt-1 text-xs text-gray-500">
            Drag the pin or click the map to adjust the location manually.
          </p>
        ) : null}
      </div>
    </section>
  );
}
