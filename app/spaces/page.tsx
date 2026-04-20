"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SpaceCard from "@/app/components/SpaceCard";
import PriceRangeFilter from "@/app/components/PriceRangeFilter";
import MapPicker from "@/app/components/MapView";
import { Search, MapPinned, MapPin, ArrowUpDown, X } from "lucide-react";
import MapView from "@/app/components/MapView";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState(params.get("q") || "");
  const [typeFilter, setTypeFilter] = useState(params.get("type") || "all");
  const [cityFilter, setCityFilter] = useState(params.get("city") || "all");
  const [sortBy, setSortBy] = useState(
    params.get("sort") || "price_high_low"
  );

  const [bookingUnitFilter, setBookingUnitFilter] = useState(
    params.get("bookingUnit") || "all"
  );

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
      getDefaultMax(params.get("bookingUnit") || "all")
    )
  );

  const [showMap, setShowMap] = useState(false);

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
    cityFilter,
    bookingUnitFilter,
    minPrice,
    maxPrice,
    sortBy,
  ]);

  function clearAllFilters() {
    setSearch("");
    setTypeFilter("all");
    setCityFilter("all");
    setSortBy("price_high_low");
    setBookingUnitFilter("all");
    setMinPrice(0);
    setMaxPrice(getDefaultMax("all"));
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
        className="mb-6 grid scroll-mt-24 gap-3 md:grid-cols-4"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-md border border-gray-300 bg-white px-10 py-3 text-sm outline-none focus:border-[#192a3a]"
            aria-label="Search spaces by keyword or area"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#192a3a]"
        >
          <option value="all">All types</option>
          {LISTING_SPACE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#192a3a]"
        >
          <option value="all">All cities</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>

        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-10 py-3 text-sm outline-none focus:border-[#192a3a]"
          >
            <option value="price_high_low">Price high → low</option>
            <option value="price_low_high">Price low → high</option>
          </select>
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
              <SpaceCard key={space.id} space={space} />
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
    </main >
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