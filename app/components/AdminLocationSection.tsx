"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { buildAddressQuery, type GeocodedAddress } from "@/lib/geocoding";
import { ZA_PROVINCES } from "@/lib/za-provinces";

const MapPicker = dynamic(() => import("@/app/components/MapPicker"), {
  ssr: false,
});

const DEFAULT_LAT = -33.9249;
const DEFAULT_LNG = 18.4241;

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
  const [searching, setSearching] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const suggestionAbortRef = useRef<AbortController | null>(null);

  const hasPin =
    value.latitude !== null &&
    value.longitude !== null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude);

  const mapLat = hasPin ? value.latitude! : DEFAULT_LAT;
  const mapLng = hasPin ? value.longitude! : DEFAULT_LNG;

  useEffect(() => {
    if (readOnly) return;

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

  function selectSuggestion(result: GeocodedAddress) {
    onChange(applyGeocodedAddress(value, result, true));
    setSuggestionsOpen(false);
    setGeoMessage("Address selected. Pin placed on map.");
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

      onChange(applyGeocodedAddress(value, matches[0], true));
      setGeoMessage("Address found. Pin placed on map.");
    } catch (err) {
      setGeoMessage(
        err instanceof Error ? err.message : "Could not search for the address."
      );
    } finally {
      setSearching(false);
    }
  }

  async function reverseGeocodePin(lat: number, lng: number) {
    setReverseGeocoding(true);
    try {
      const result = await adminApiFetch(
        `/api/admin/geocode?lat=${lat}&lng=${lng}`
      );
      const geocoded = result.result as GeocodedAddress | undefined;
      if (geocoded) {
        onChange({
          latitude: lat,
          longitude: lng,
          ...applyGeocodedAddress(value, geocoded, false),
        });
      } else {
        onChange({ latitude: lat, longitude: lng });
      }
    } catch (err) {
      console.error("Reverse geocoding failed", err);
      onChange({ latitude: lat, longitude: lng });
    } finally {
      setReverseGeocoding(false);
    }
  }

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
                  key={`${suggestion.latitude}-${suggestion.longitude}-${idx}`}
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
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void findAddressOnMap()}
            disabled={searching || reverseGeocoding}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            {searching ? "Finding…" : "Find address on map"}
          </button>
        </div>
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
          onChange={(latitude, longitude) => {
            if (readOnly) return;
            void reverseGeocodePin(latitude, longitude);
          }}
        />
        {hasPin ? (
          <p className="mt-2 text-sm text-gray-700">
            Pin placed at: {value.latitude!.toFixed(6)}, {value.longitude!.toFixed(6)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-800">
            This listing does not have a map pin yet.
          </p>
        )}
        {reverseGeocoding ? (
          <p className="mt-1 text-xs text-gray-500">Updating address from map pin…</p>
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
