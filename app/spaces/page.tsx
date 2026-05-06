"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SpaceCard from "@/app/components/SpaceCard";
import PriceRangeFilter from "@/app/components/PriceRangeFilter";
import {
  Search,
  MapPin,
  ArrowUpDown,
  X,
  Package,
  Car,
  Briefcase,
  Sparkles,
  ChevronDown,
  ShieldCheck,
  CheckCircle2,
  BadgeCheck,
  SlidersHorizontal,
} from "lucide-react";
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

type UserFavouriteRow = {
  space_id: string;
};

const heroBackgroundImage = "/images/findmyspace-hero.jpg";
// TODO: Replace with final premium FindMySpace launch hero image.

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
  const [showMoreTypes, setShowMoreTypes] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [draftBookingUnit, setDraftBookingUnit] = useState("all");
  const [draftMinPrice, setDraftMinPrice] = useState(0);
  const [draftMaxPrice, setDraftMaxPrice] = useState(getDefaultMax("all"));
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [favouriteSpaceIds, setFavouriteSpaceIds] = useState<Set<string>>(new Set());
  const [favouriteBusyIds, setFavouriteBusyIds] = useState<Set<string>>(new Set());

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
    let active = true;

    async function loadUserAndFavourites(userId?: string | null) {
      const resolvedUserId =
        userId !== undefined
          ? userId
          : (await supabase.auth.getUser()).data.user?.id ?? null;

      if (!active) return;
      setCurrentUserId(resolvedUserId);

      if (!resolvedUserId) {
        setFavouriteSpaceIds(new Set());
        return;
      }

      const { data, error } = await supabase
        .from("user_favourites" as never)
        .select("space_id")
        .eq("user_id", resolvedUserId);

      if (!active) return;
      if (error) {
        console.warn("Failed to load favourites:", error.message);
        return;
      }

      const nextSet = new Set(
        ((data || []) as UserFavouriteRow[]).map((row) => row.space_id)
      );
      setFavouriteSpaceIds(nextSet);
    }

    loadUserAndFavourites();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      loadUserAndFavourites(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
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

  const locationLabel = cityFilter === "all" ? "across South Africa" : `near ${cityFilter}`;

  const primaryTypeChips = useMemo(
    () => [
      { key: "all", label: "All spaces", value: "all", icon: Sparkles },
      { key: "storage", label: "Storage", value: "storage", icon: Package },
      { key: "parking", label: "Parking", value: "parking", icon: Car },
      { key: "office", label: "Office", value: "office", icon: Briefcase },
      { key: "event", label: "Event", value: "event_space", icon: BadgeCheck },
    ],
    []
  );

  const moreTypeOptions = useMemo(() => {
    const primaryValues = new Set(primaryTypeChips.map((chip) => chip.value));
    return typeOptions.options.filter((opt) => !primaryValues.has(opt.value));
  }, [typeOptions.options, primaryTypeChips]);

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

  async function handleToggleFavourite(spaceId: string) {
    if (!currentUserId) {
      router.push("/login");
      return;
    }

    setFavouriteBusyIds((prev) => new Set(prev).add(spaceId));
    const isAlreadyFavourite = favouriteSpaceIds.has(spaceId);

    if (isAlreadyFavourite) {
      const { error } = await supabase
        .from("user_favourites" as never)
        .delete()
        .eq("user_id", currentUserId)
        .eq("space_id", spaceId);

      if (!error) {
        setFavouriteSpaceIds((prev) => {
          const next = new Set(prev);
          next.delete(spaceId);
          return next;
        });
      } else {
        console.warn("Failed to remove favourite:", error.message);
      }
    } else {
      const { error } = await supabase
        .from("user_favourites" as never)
        .insert({ user_id: currentUserId, space_id: spaceId } as never);

      if (!error) {
        setFavouriteSpaceIds((prev) => new Set(prev).add(spaceId));
      } else {
        console.warn("Failed to save favourite:", error.message);
      }
    }

    setFavouriteBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(spaceId);
      return next;
    });
  }

  function openPriceModal() {
    const resolvedUnit =
      bookingUnitFilter === "hour" || bookingUnitFilter === "day" || bookingUnitFilter === "month"
        ? bookingUnitFilter
        : "all";
    setDraftBookingUnit(resolvedUnit);
    setDraftMinPrice(minPrice);
    setDraftMaxPrice(maxPrice);
    setShowPriceModal(true);
  }

  function applyPriceModal() {
    const resolvedUnit =
      draftBookingUnit === "hour" || draftBookingUnit === "day" || draftBookingUnit === "month"
        ? draftBookingUnit
        : "all";
    setBookingUnitFilter(resolvedUnit);
    setMinPrice(draftMinPrice);
    setMaxPrice(draftMaxPrice);
    setShowPriceModal(false);
  }

  function clearPriceModal() {
    const defaultMax = getDefaultMax("all");
    setDraftBookingUnit("all");
    setDraftMinPrice(0);
    setDraftMaxPrice(defaultMax);
    setBookingUnitFilter("all");
    setMinPrice(0);
    setMaxPrice(defaultMax);
    setShowPriceModal(false);
  }

  return (
    <main className="pb-10 text-[#192a3a]">
      <section className="relative h-[320px] w-full overflow-hidden sm:h-[360px] lg:h-[410px]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${heroBackgroundImage}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/72 via-white/52 to-white/36" />
        <div className="mx-auto h-full max-w-7xl px-4 sm:px-6">
          <div className="relative z-10 pt-12 sm:pt-14 lg:pt-16">
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-[#0f172a] sm:text-5xl lg:text-6xl">
              The right space
              <br />
              in the <span className="text-[#c1121f]">right place.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#1f2937] sm:text-lg">
              Find trusted storage, parking, workspace and lifestyle spaces from local owners.
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto -mt-16 max-w-6xl px-4 sm:-mt-20 sm:px-6">
        <div id="browse-search" className="scroll-mt-24 overflow-visible rounded-3xl border border-[#e5e7eb] bg-white p-4 shadow-[0_28px_65px_rgba(15,23,42,0.12)] sm:p-6">
          <div className="mb-3">
            <p className="text-sm font-medium text-[#1e293b]">What type of space do you need?</p>
          </div>

          <div className="relative z-10 mb-5 flex gap-2 overflow-x-auto overflow-y-visible py-1">
            {primaryTypeChips.map((chip) => {
              const Icon = chip.icon;
              const selected = typeFilter === chip.value || (chip.value === "all" && typeFilter === "all");
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    setTypeFilter(chip.value);
                    if (chip.value === "all") setIntentFilter(null);
                    setShowMoreTypes(false);
                  }}
                  className={`inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 ${
                    selected
                      ? "border-[#c1121f] bg-[#c1121f] text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
                      : "border-[#d7dde3] bg-white text-[#334155] hover:-translate-y-0.5 hover:border-[#b8c2cc] hover:shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {chip.label}
                </button>
              );
            })}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowMoreTypes((prev) => !prev)}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 ${
                  !primaryTypeChips.some((chip) => chip.value === typeFilter) && typeFilter !== "all"
                    ? "border-[#c1121f] bg-[#c1121f] text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
                    : "border-[#d7dde3] bg-white text-[#334155] hover:-translate-y-0.5 hover:border-[#b8c2cc] hover:shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                }`}
                aria-expanded={showMoreTypes}
                aria-haspopup="menu"
              >
                More
                <ChevronDown className="h-4 w-4" />
              </button>
              {showMoreTypes ? (
                <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-64 rounded-2xl border border-[#e1e6ea] bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.18)]">
                  <div className="max-h-72 overflow-auto py-1">
                    {moreTypeOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setTypeFilter(opt.value);
                          setShowMoreTypes(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                          typeFilter === opt.value
                            ? "bg-[#fff1f2] font-medium text-[#9f1239]"
                            : "text-[#334155] hover:bg-[#f8fafc]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
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
            className="sr-only"
            aria-label="Space type filter"
          >
            <option value="all">{typeOptions.allLabel}</option>
            {intentFilter ? <option value="__all_types">All space types</option> : null}
            {typeOptions.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_112px]">
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-medium leading-5 text-[#475569]">Where do you need it?</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Location, suburb, city, or keyword"
                  className="min-h-[48px] w-full rounded-xl border border-[#d4dbe2] bg-white px-10 py-2.5 text-sm shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  aria-label="Location"
                />
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-medium leading-5 text-[#475569]">Rental period</p>
              <div className="min-h-[48px]">
                <BrowseWhenFilter
                  applied={appliedWhen}
                  availabilitySignal={panelAvailabilitySignal}
                  suggestedUnit={suggestedWhenUnit}
                  placeholderText="Select duration"
                  triggerClassName="min-h-[48px] h-[48px] w-full rounded-xl border border-[#d4dbe2] bg-white px-4 py-2.5 text-sm font-medium leading-5 text-[#334155] shadow-sm transition-all duration-200 hover:border-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#c1121f]/20"
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

            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-medium leading-5 text-[#475569]">Price range</p>
              <button
                type="button"
                onClick={openPriceModal}
                className="inline-flex min-h-[48px] w-full items-center justify-between rounded-xl border border-[#d4dbe2] bg-white px-4 text-sm text-[#334155] shadow-sm transition-all duration-200 hover:border-[#cbd5e1] hover:bg-[#fafafa]"
              >
                <span className="truncate">
                  {bookingUnitFilter === "all" ? "All units" : bookingUnitFilter} · R{minPrice} - R{maxPrice}
                </span>
                <SlidersHorizontal className="h-4 w-4 text-[#64748b]" />
              </button>
            </div>

            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-medium leading-5 text-transparent">Search</p>
              <button
                type="button"
                onClick={() => pushBrowseUrl(appliedWhen)}
                className="min-h-[48px] w-full rounded-xl bg-[#c1121f] px-6 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(193,18,31,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#a70f19] hover:shadow-[0_14px_24px_rgba(193,18,31,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2"
              >
                Search
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-t border-[#edf1f5] pt-4 sm:grid-cols-3">
            <article className="flex items-center gap-3 rounded-2xl bg-[#fafbfc] px-3 py-3">
              <div className="inline-flex shrink-0 rounded-lg border border-[#f0d5d8] bg-[#fff6f7] p-2 text-[#c1121f]">
                <BadgeCheck className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#0f172a]">Verified spaces</h3>
                <p className="text-xs text-[#475569]">Owners are reviewed before listings go live.</p>
              </div>
            </article>
            <article className="flex items-center gap-3 rounded-2xl bg-[#fafbfc] px-3 py-3">
              <div className="inline-flex shrink-0 rounded-lg border border-[#f0d5d8] bg-[#fff6f7] p-2 text-[#c1121f]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#0f172a]">Secure booking</h3>
                <p className="text-xs text-[#475569]">Bookings and payments follow a secure process.</p>
              </div>
            </article>
            <article className="flex items-center gap-3 rounded-2xl bg-[#fafbfc] px-3 py-3">
              <div className="inline-flex shrink-0 rounded-lg border border-[#f0d5d8] bg-[#fff6f7] p-2 text-[#c1121f]">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#0f172a]">Approved listings</h3>
                <p className="text-xs text-[#475569]">Spaces are checked before being made available.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-4 py-2 text-sm text-[#475569] shadow-sm">
            <MapPin className="h-4 w-4 text-[#c1121f]" />
            <span>
              {filteredSpaces.length} verified spaces available {locationLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="inline-flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-medium text-[#334155] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fafafa]"
            >
              <MapPin className="h-4 w-4" />
              Map view
            </button>
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="min-h-[40px] rounded-full border border-[#e2e8f0] bg-white py-2 pl-9 pr-4 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                aria-label="Sort by"
              >
                <option value="price_high_low">Sort by: Featured</option>
                <option value="price_low_high">Sort by: Price low to high</option>
              </select>
            </div>
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-4 py-2 text-sm text-[#475569] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:text-[#192a3a]"
            >
              <X className="h-4 w-4" />
              Clear filters
            </button>
          </div>
        </div>

        <div>
          {message ? (
            <p className="text-sm text-red-600">{message}</p>
          ) : loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : filteredSpaces.length === 0 ? (
            <p className="text-sm text-gray-600">No spaces found.</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredSpaces.map((space) => (
                <SpaceCard
                  key={space.id}
                  space={space}
                  availabilityHint={getCardAvailabilityHint({
                    space,
                    when: appliedWhen,
                  })}
                  isFavourite={favouriteSpaceIds.has(space.id)}
                  favouriteBusy={favouriteBusyIds.has(space.id)}
                  onToggleFavourite={handleToggleFavourite}
                />
              ))}
            </div>
          )}
        </div>
      </section>

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

      {showPriceModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          onClick={() => setShowPriceModal(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-4 shadow-2xl sm:w-[640px] sm:rounded-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0f172a]">Price filter</h2>
              <button
                type="button"
                onClick={() => setShowPriceModal(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e2e8f0] text-[#475569] transition hover:bg-[#f8fafc]"
                aria-label="Close price filter"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <PriceRangeFilter
              bookingUnitFilter={draftBookingUnit}
              setBookingUnitFilter={setDraftBookingUnit}
              minPrice={draftMinPrice}
              maxPrice={draftMaxPrice}
              setMinPrice={setDraftMinPrice}
              setMaxPrice={setDraftMaxPrice}
              absoluteMin={0}
              absoluteMax={20000}
              step={50}
              compact
            />

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={clearPriceModal}
                className="min-h-[42px] rounded-xl border border-[#e2e8f0] bg-white px-4 text-sm font-medium text-[#475569] transition hover:bg-[#f8fafc]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={applyPriceModal}
                className="min-h-[42px] rounded-xl bg-[#c1121f] px-5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(193,18,31,0.28)] transition hover:bg-[#a70f19]"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
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