"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SpaceCard from "@/app/components/SpaceCard";
import PriceRangeFilter from "@/app/components/PriceRangeFilter";
import { Search, MapPinned, MapPin, ArrowUpDown, X } from "lucide-react";
import MapView from "@/app/components/MapView";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";
import { BrowseWhenFilter } from "@/app/components/BrowseWhenFilter";
import {
  parseAppliedWhenFromParams,
  spaceMatchesWhenMinBooking,
  writeAppliedWhenToParams,
  type AppliedWhen,
  type WhenDurationUnit,
} from "@/lib/browse-when-filter";
import {
  getCardAvailabilityHint,
  getPanelAvailabilitySignal,
  type SpaceAvailabilityInput,
} from "@/lib/browse-availability-signals";
import {
  getIntentDefinition,
  getSuggestedUnitForIntent,
  parseIntent,
  type SpaceIntentKey,
} from "@/lib/space-intents";

type Space = {
  id: string;
  title: string;
  description?: string | null;
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
  image_urls?: string[];
  status?: string | null;
};

type SpaceImageRow = {
  space_id: string;
  image_url: string;
  sort_order: number | null;
};

function parseNumberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function SpacesPageContent({ searchParamsString }: { searchParamsString: string }) {
  const params = useMemo(() => new URLSearchParams(searchParamsString), [searchParamsString]);
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState(params.get("q") || "");
  const [intentFilter, setIntentFilter] = useState<SpaceIntentKey | null>(() =>
    parseIntent(params.get("intent"))
  );
  const [typeFilter, setTypeFilter] = useState(params.get("type") || "all");
  const [cityFilter, setCityFilter] = useState(params.get("city") || "all");
  const [sortBy, setSortBy] = useState(
    params.get("sort") || "price_high_low"
  );

  const [appliedWhen, setAppliedWhen] = useState<AppliedWhen | null>(() =>
    parseAppliedWhenFromParams(params)
  );

  const [bookingUnitFilter, setBookingUnitFilter] = useState(() => {
    const wu = params.get("whenUnit");
    if (wu === "hour" || wu === "day" || wu === "month") return wu;
    const bu = params.get("bookingUnit");
    if (bu === "hour" || bu === "day" || bu === "month") return bu;
    return "all";
  });

  function getDefaultMax(unit: string) {
    if (unit === "hour") return 5000;
    if (unit === "day") return 10000;
    return 20000;
  }

  const [minPrice, setMinPrice] = useState(
    parseNumberParam(params.get("min"), 0)
  );

  const [maxPrice, setMaxPrice] = useState(
    parseNumberParam(
      params.get("max"),
      getDefaultMax(
        params.get("whenUnit") || params.get("bookingUnit") || "all"
      )
    )
  );

  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(searchParamsString);
    setIntentFilter(parseIntent(p.get("intent")));
    const when = parseAppliedWhenFromParams(p);
    setAppliedWhen(when);
    const wu = p.get("whenUnit");
    if (wu === "hour" || wu === "day" || wu === "month") {
      setBookingUnitFilter(wu);
      return;
    }
    const bu = p.get("bookingUnit");
    setBookingUnitFilter(
      bu === "hour" || bu === "day" || bu === "month" ? bu : "all"
    );
  }, [searchParamsString]);

  const suggestedWhenUnit = useMemo((): WhenDurationUnit | null => {
    if (typeFilter === "all") {
      const suggested = getSuggestedUnitForIntent(intentFilter);
      if (suggested) return suggested;
    }
    if (typeFilter === "parking") return "month";
    if (typeFilter === "event_space") return "hour";
    if (
      typeFilter === "office" ||
      typeFilter === "meeting_room" ||
      typeFilter === "boardroom" ||
      typeFilter === "desk_coworking"
    ) {
      return "day";
    }
    return null;
  }, [typeFilter, intentFilter]);

  const typeOptions = useMemo(() => {
    if (!intentFilter) {
      return {
        allLabel: "All types",
        options: LISTING_SPACE_TYPE_OPTIONS,
      };
    }
    const def = getIntentDefinition(intentFilter);
    if (!def) {
      return {
        allLabel: "All types",
        options: LISTING_SPACE_TYPE_OPTIONS,
      };
    }
    const mapped = new Set(def.mappedSpaceTypes);
    const filtered = LISTING_SPACE_TYPE_OPTIONS.filter((opt) =>
      mapped.has(opt.value)
    );
    return {
      allLabel: def.allTypesLabel,
      options: filtered.length > 0 ? filtered : LISTING_SPACE_TYPE_OPTIONS,
    };
  }, [intentFilter]);

  const pushBrowseUrl = useCallback(
    (
      nextAppliedWhen: AppliedWhen | null,
      bookingUnitOverride?: "all" | "hour" | "day" | "month",
      intentOverride?: SpaceIntentKey | null
    ) => {
      const p = new URLSearchParams();
      const q = search.trim();
      if (q) p.set("q", q);
      const resolvedIntent =
        intentOverride !== undefined ? intentOverride : intentFilter;
      if (resolvedIntent) p.set("intent", resolvedIntent);
      if (typeFilter !== "all") p.set("type", typeFilter);
      if (cityFilter !== "all") p.set("city", cityFilter);
      if (sortBy !== "price_high_low") p.set("sort", sortBy);

      const buResolved =
        nextAppliedWhen != null
          ? nextAppliedWhen.unit
          : bookingUnitOverride !== undefined
            ? bookingUnitOverride
            : bookingUnitFilter;

      if (buResolved !== "all") p.set("bookingUnit", buResolved);
      if (minPrice !== 0) p.set("min", String(minPrice));
      const defMax = getDefaultMax(
        buResolved === "hour" || buResolved === "day" || buResolved === "month"
          ? buResolved
          : "all"
      );
      if (maxPrice !== defMax) p.set("max", String(maxPrice));
      writeAppliedWhenToParams(p, nextAppliedWhen);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [
      search,
      typeFilter,
      intentFilter,
      cityFilter,
      sortBy,
      bookingUnitFilter,
      minPrice,
      maxPrice,
      pathname,
      router,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#browse-search") return;
    window.requestAnimationFrame(() => {
      document.getElementById("browse-search")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      searchInputRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    async function loadSpaces() {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("spaces")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const baseSpaces = (data || []) as Space[];
      const spaceIds = baseSpaces.map((space) => space.id);

      if (spaceIds.length === 0) {
        setSpaces([]);
        setLoading(false);
        return;
      }

      const { data: imageRows, error: imageError } = await supabase
        .from("space_images")
        .select("space_id, image_url, sort_order")
        .in("space_id", spaceIds)
        .order("sort_order", { ascending: true });

      if (imageError) {
        setMessage(imageError.message);
        setLoading(false);
        return;
      }

      const imageMap = new Map<string, string[]>();

      ((imageRows || []) as SpaceImageRow[]).forEach((row) => {
        const current = imageMap.get(row.space_id) || [];
        current.push(row.image_url);
        imageMap.set(row.space_id, current);
      });

      const mergedSpaces = baseSpaces.map((space) => ({
        ...space,
        image_urls: imageMap.get(space.id) || [],
      }));

      setSpaces(mergedSpaces);
      setLoading(false);
    }

    loadSpaces();
  }, []);

  useEffect(() => {
    setMinPrice(0);

    if (bookingUnitFilter === "hour") {
      setMaxPrice(5000);
    } else if (bookingUnitFilter === "day") {
      setMaxPrice(10000);
    } else {
      setMaxPrice(getDefaultMax("all")); // all + month
    }
  }, [bookingUnitFilter]);

  const cityOptions = useMemo(() => {
    const unique = Array.from(
      new Set(spaces.map((space) => space.city).filter(Boolean))
    ) as string[];

    return unique.sort((a, b) => a.localeCompare(b));
  }, [spaces]);

  const filteredSpaces = useMemo(() => {
    let result = [...spaces];

    if (search.trim()) {
      const query = search.trim().toLowerCase();

      result = result.filter((space) => {
        const haystack = [
          space.title,
          space.description,
          space.address_line_1,
          space.suburb,
          space.city,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }

    if (typeFilter !== "all") {
      result = result.filter((space) => space.space_type === typeFilter);
    } else if (intentFilter) {
      const def = getIntentDefinition(intentFilter);
      if (def) {
        const mapped = new Set(def.mappedSpaceTypes);
        result = result.filter((space) =>
          mapped.has((space.space_type || "").toLowerCase())
        );
      }
    }

    if (cityFilter !== "all") {
      result = result.filter((space) => space.city === cityFilter);
    }

    result = result.filter((space) => {
      if (
        bookingUnitFilter !== "all" &&
        space.booking_unit !== bookingUnitFilter
      ) {
        return false;
      }

      if (appliedWhen && !spaceMatchesWhenMinBooking(space, appliedWhen)) {
        return false;
      }

      const price =
        bookingUnitFilter === "hour"
          ? space.price_per_hour
          : bookingUnitFilter === "month"
            ? space.price_per_month
            : bookingUnitFilter === "day"
              ? space.price_per_day
              : space.booking_unit === "hour"
                ? space.price_per_hour
                : space.booking_unit === "month"
                  ? space.price_per_month
                  : space.price_per_day;

      if (price == null) return false;
      return price >= minPrice && price <= maxPrice;
    });

    result.sort((a, b) => {
      const getComparablePrice = (space: Space) => {
        if (bookingUnitFilter === "hour") return space.price_per_hour ?? 0;
        if (bookingUnitFilter === "month") return space.price_per_month ?? 0;
        if (bookingUnitFilter === "day") return space.price_per_day ?? 0;

        if (space.booking_unit === "hour") return space.price_per_hour ?? 0;
        if (space.booking_unit === "month") return space.price_per_month ?? 0;
        return space.price_per_day ?? 0;
      };

      const priceA = getComparablePrice(a);
      const priceB = getComparablePrice(b);

      if (sortBy === "price_low_high") return priceA - priceB;
      return priceB - priceA;
    });

    return result;
  }, [
    spaces,
    search,
    typeFilter,
    intentFilter,
    cityFilter,
    bookingUnitFilter,
    appliedWhen,
    minPrice,
    maxPrice,
    sortBy,
  ]);

  const panelAvailabilitySignal = useMemo(
    () =>
      getPanelAvailabilitySignal({
        allSpaces: spaces as SpaceAvailabilityInput[],
        filteredSpaces: filteredSpaces as SpaceAvailabilityInput[],
        when: appliedWhen,
      }),
    [spaces, filteredSpaces, appliedWhen]
  );

  function clearAllFilters() {
    setSearch("");
    setTypeFilter("all");
    setIntentFilter(null);
    setCityFilter("all");
    setSortBy("price_high_low");
    setAppliedWhen(null);
    setBookingUnitFilter("all");
    setMinPrice(0);
    setMaxPrice(getDefaultMax("all"));
    pushBrowseUrl(null, "all", null);
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 text-[#192a3a]">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Browse spaces</h1>
        <p className="text-sm text-gray-600">
          Find the right space for your needs.
        </p>
      </div>

      <div
        id="browse-search"
        className="mb-6 scroll-mt-24 rounded-xl border border-gray-200/90 bg-white p-4 shadow-sm ring-1 ring-black/[0.03]"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-lg border border-gray-200 bg-white px-10 py-2.5 text-sm shadow-sm outline-none ring-emerald-500/20 transition focus:border-emerald-500 focus:ring-2"
              aria-label="Search spaces by keyword or area"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => {
              if (e.target.value === "__all_types") {
                setTypeFilter("all");
                setIntentFilter(null);
                return;
              }
              setTypeFilter(e.target.value);
            }}
            className="min-h-[42px] rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none ring-emerald-500/20 transition focus:border-emerald-500 focus:ring-2"
          >
            <option value="all">{typeOptions.allLabel}</option>
            {intentFilter ? <option value="__all_types">All space types</option> : null}
            {typeOptions.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="min-h-[42px] rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none ring-emerald-500/20 transition focus:border-emerald-500 focus:ring-2"
          >
            <option value="all">All cities</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>

          <div className="relative min-w-0">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="min-h-[42px] w-full rounded-lg border border-gray-200 bg-white px-10 py-2.5 text-sm shadow-sm outline-none ring-emerald-500/20 transition focus:border-emerald-500 focus:ring-2"
            >
              <option value="price_high_low">Price high → low</option>
              <option value="price_low_high">Price low → high</option>
            </select>
          </div>

          <BrowseWhenFilter
            applied={appliedWhen}
            availabilitySignal={panelAvailabilitySignal}
            suggestedUnit={suggestedWhenUnit}
            onApply={(w) => {
              setAppliedWhen(w);
              setBookingUnitFilter(w.unit);
              pushBrowseUrl(w);
            }}
            onClear={() => {
              setAppliedWhen(null);
              setBookingUnitFilter("all");
              pushBrowseUrl(null, "all");
            }}
          />
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-4 w-4" />
          <span>{filteredSpaces.length} spaces found</span>
        </div>

        <button
          type="button"
          onClick={clearAllFilters}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#192a3a]"
        >
          <X className="h-4 w-4" />
          Clear filters
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-6">
          <button
            onClick={() => setShowMap(true)}
            className="w-full rounded-md border border-gray-200 bg-white p-4 shadow-sm text-left hover:shadow-md transition"
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#192a3a]">
              <MapPinned className="h-5 w-5" />
              <span>View map</span>
            </div>

            <div className="overflow-hidden rounded-md bg-gray-100">
              <Image
                src="/map-preview.png"
                alt="Map preview"
                width={600}
                height={360}
                className="h-[180px] w-full object-cover"
              />
            </div>
          </button>

          <PriceRangeFilter
            bookingUnitFilter={bookingUnitFilter}
            setBookingUnitFilter={setBookingUnitFilter}
            minPrice={minPrice}
            maxPrice={maxPrice}
            setMinPrice={setMinPrice}
            setMaxPrice={setMaxPrice}
            absoluteMin={0}
            absoluteMax={20000}
            step={50}
          />
        </div>

        <div className="space-y-5">
          {message ? (
            <p className="text-sm text-red-600">{message}</p>
          ) : loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : filteredSpaces.length === 0 ? (
            <p className="text-sm text-gray-600">No spaces found.</p>
          ) : (
            filteredSpaces.map((space) => (
              <SpaceCard
                key={space.id}
                space={space}
                availabilityHint={getCardAvailabilityHint({
                  space,
                  when: appliedWhen,
                })}
              />
            ))
          )}
        </div>
      </div>

      {showMap && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onClick={() => setShowMap(false)}
        >
          <div
            className="relative w-[95%] max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[#192a3a]">Map view</h2>
                <p className="text-sm text-gray-500">
                  Showing {filteredSpaces.length} filtered space
                  {filteredSpaces.length === 1 ? "" : "s"}
                </p>
              </div>

              <button
                onClick={() => setShowMap(false)}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-[#192a3a] shadow-sm transition hover:bg-gray-50"
                aria-label="Close map"
              >
                Close
              </button>
            </div>

            <div className="p-4">
              <MapView spaces={filteredSpaces} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SpacesSearchParamsClient() {
  const searchParams = useSearchParams();
  return <SpacesPageContent searchParamsString={searchParams.toString()} />;
}

export default function SpacesPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-7xl px-6 py-10 text-sm text-gray-600">Loading...</main>}>
      <SpacesSearchParamsClient />
    </Suspense>
  );
}