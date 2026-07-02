"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SpaceCard from "@/app/components/SpaceCard";
import {
  PUBLIC_LISTING_MODE_ENQUIRY,
  PUBLIC_LISTING_MODE_LIVE,
} from "@/lib/public-listing-mode";
import {
  isExplicitBrowsePriceFilter,
  passesPublicBrowseListingGate,
  spaceMatchesBrowsePriceRange,
} from "@/lib/public-browse-eligibility";
import { resolveSpacePriceAmount } from "@/lib/space-pricing";
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
  Dumbbell,
  CircleHelp,
} from "lucide-react";
import MapView from "@/app/components/MapView";
import {
  LISTING_SPACE_TYPE_OPTIONS,
  SPORT_TYPE_OPTIONS,
  buildAttributeSearchText,
} from "@/app/data/spaceFeatureConfig";
import {
  sportListingBoostScore,
  sportSearchHaystackExtras,
  spaceHasSportTypes,
} from "@/lib/sport-search";
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
import {
  parseSpaceIntent,
  resolveBrowseIntentParam,
} from "@/lib/space-intent-parser";
import {
  formatIntentSummary,
  scoreSpaceForIntent,
} from "@/lib/space-intent-ranking";
import { PUBLIC_SPACE_SELECT } from "@/lib/public-space-columns";
import {
  GROUP_SIZE_FILTER_BUCKETS,
  parseGroupSizeBucketFilter,
  spaceMatchesGroupSize,
  spaceMatchesGroupSizeBucket,
} from "@/lib/group-size";

type Space = {
  id: string;
  title: string;
  description?: string | null;
  city: string | null;
  suburb: string | null;
  street_address?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_amount?: number | null;
  price_unit?: string | null;
  deposit_required?: boolean | null;
  deposit_amount?: number | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  image_urls?: string[];
  attributes?: Record<string, string[]>;
  status?: string | null;
  public_listing_mode?: string | null;
};

type SpaceImageRow = {
  space_id: string;
  image_url: string;
  sort_order: number | null;
};

type SpaceAttributeRow = {
  space_id: string;
  attribute_key: string;
  attribute_value: string | null;
};

type UserFavouriteRow = {
  space_id: string;
};

const heroBackgroundImage = "/images/browse-hero.png";

const NL_SEARCH_PLACEHOLDER = "Try: Host a party for 30 people in Paarl";

const NL_SEARCH_EXAMPLES = [
  "Host a party for 30 people in Paarl",
  "Play tennis tomorrow at 4pm",
  "Store a caravan from January to December",
  "Meeting room for 12 people",
] as const;

function parseNumberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSportTypeParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function SpacesPageContent({ searchParamsString }: { searchParamsString: string }) {
  const params = useMemo(() => new URLSearchParams(searchParamsString), [searchParamsString]);
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nlExamplesRef = useRef<HTMLDivElement>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState(params.get("q") || "");
  const initialIntentParam = resolveBrowseIntentParam(params.get("intent"));
  const [intentFilter, setIntentFilter] = useState<SpaceIntentKey | null>(() =>
    parseIntent(initialIntentParam.browseIntentKey)
  );
  const [nlQuery, setNlQuery] = useState(initialIntentParam.naturalLanguageQuery);
  const [nlInput, setNlInput] = useState(initialIntentParam.naturalLanguageQuery);
  const [typeFilter, setTypeFilter] = useState(params.get("type") || "all");
  const [sportTypeFilters, setSportTypeFilters] = useState<string[]>(() =>
    parseSportTypeParam(params.get("sportType"))
  );
  const [cityFilter, setCityFilter] = useState(params.get("city") || "all");
  const [groupSizeFilter, setGroupSizeFilter] = useState(params.get("groupSize") || "");
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
  const [showNlExamples, setShowNlExamples] = useState(false);
  const [mobileRefineOpen, setMobileRefineOpen] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [draftBookingUnit, setDraftBookingUnit] = useState("all");
  const [draftMinPrice, setDraftMinPrice] = useState(0);
  const [draftMaxPrice, setDraftMaxPrice] = useState(getDefaultMax("all"));
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [favouriteSpaceIds, setFavouriteSpaceIds] = useState<Set<string>>(new Set());
  const [favouriteBusyIds, setFavouriteBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const p = new URLSearchParams(searchParamsString);
    const resolvedIntent = resolveBrowseIntentParam(p.get("intent"));
    setIntentFilter(parseIntent(resolvedIntent.browseIntentKey));
    setNlQuery(resolvedIntent.naturalLanguageQuery);
    setNlInput(resolvedIntent.naturalLanguageQuery);
    setTypeFilter(p.get("type") || "all");
    setSportTypeFilters(parseSportTypeParam(p.get("sportType")));
    setGroupSizeFilter(p.get("groupSize") || "");
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
    if (typeFilter === "sport_venue") return "hour";
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
      if (nlQuery.trim()) {
        p.set("intent", nlQuery.trim());
      } else if (resolvedIntent) {
        p.set("intent", resolvedIntent);
      }
      if (typeFilter !== "all") p.set("type", typeFilter);
      if (sportTypeFilters.length > 0) {
        p.set("sportType", sportTypeFilters.join(","));
      }
      if (cityFilter !== "all") p.set("city", cityFilter);
      if (groupSizeFilter.trim()) p.set("groupSize", groupSizeFilter.trim());
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
      nlQuery,
      typeFilter,
      sportTypeFilters,
      intentFilter,
      cityFilter,
      groupSizeFilter,
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
    if (!showNlExamples) return;
    function onDocClick(e: MouseEvent) {
      if (!nlExamplesRef.current?.contains(e.target as Node)) {
        setShowNlExamples(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showNlExamples]);

  useEffect(() => {
    async function loadSpaces() {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("spaces")
        .select(PUBLIC_SPACE_SELECT)
        .in("public_listing_mode", [
          PUBLIC_LISTING_MODE_ENQUIRY,
          PUBLIC_LISTING_MODE_LIVE,
        ])
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
      const attributeMap = new Map<string, Record<string, string[]>>();

      ((imageRows || []) as SpaceImageRow[]).forEach((row) => {
        const current = imageMap.get(row.space_id) || [];
        current.push(row.image_url);
        imageMap.set(row.space_id, current);
      });

      const { data: attributeRows, error: attributeError } = await supabase
        .from("space_attributes")
        .select("space_id, attribute_key, attribute_value")
        .in("space_id", spaceIds);

      if (attributeError) {
        setMessage(attributeError.message);
        setLoading(false);
        return;
      }

      ((attributeRows || []) as SpaceAttributeRow[]).forEach((row) => {
        if (!row.attribute_value) return;
        const current = attributeMap.get(row.space_id) || {};
        if (!current[row.attribute_key]) {
          current[row.attribute_key] = [];
        }
        current[row.attribute_key].push(row.attribute_value);
        attributeMap.set(row.space_id, current);
      });

      const mergedSpaces = baseSpaces.map((space) => ({
        ...space,
        image_urls: imageMap.get(space.id) || [],
        attributes: attributeMap.get(space.id) || {},
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

  const parsedNlIntent = useMemo(() => parseSpaceIntent(nlQuery), [nlQuery]);
  const intentSummary = useMemo(
    () => formatIntentSummary(parsedNlIntent),
    [parsedNlIntent]
  );

  const defaultBrowseMaxPrice = getDefaultMax("all");

  const explicitPriceFilter = useMemo(
    () =>
      isExplicitBrowsePriceFilter({
        minPrice,
        maxPrice,
        bookingUnitFilter,
        defaultMaxPrice: defaultBrowseMaxPrice,
        searchParams: new URLSearchParams(searchParamsString),
      }),
    [
      bookingUnitFilter,
      defaultBrowseMaxPrice,
      maxPrice,
      minPrice,
      searchParamsString,
    ]
  );

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
          buildAttributeSearchText(space.space_type, space.attributes || {}),
          sportSearchHaystackExtras(space.space_type, space.attributes),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }

    if (sportTypeFilters.length > 0) {
      result = result.filter((space) => {
        if ((space.space_type || "").toLowerCase() !== "sport_venue") return false;
        return spaceHasSportTypes(space.attributes, sportTypeFilters);
      });
    } else if (
      parsedNlIntent.sportTypes.length > 0 &&
      parsedNlIntent.confidence !== "low"
    ) {
      result = result.filter((space) => {
        if ((space.space_type || "").toLowerCase() !== "sport_venue") return false;
        return spaceHasSportTypes(space.attributes, parsedNlIntent.sportTypes);
      });
    }

    if (parsedNlIntent.rawQuery && parsedNlIntent.confidence !== "low") {
      if (
        parsedNlIntent.inferredSpaceTypes.length > 0 &&
        typeFilter === "all" &&
        !intentFilter
      ) {
        const types = new Set(parsedNlIntent.inferredSpaceTypes);
        result = result.filter((space) =>
          types.has((space.space_type || "").toLowerCase())
        );
      }

      const effectiveLocation =
        cityFilter !== "all" ? cityFilter : parsedNlIntent.location;
      if (effectiveLocation) {
        const loc = effectiveLocation.toLowerCase();
        result = result.filter(
          (space) =>
            (space.city || "").toLowerCase().includes(loc) ||
            (space.suburb || "").toLowerCase().includes(loc)
        );
      }
    } else if (parsedNlIntent.rawQuery && parsedNlIntent.confidence === "low") {
      const q = parsedNlIntent.rawQuery.toLowerCase();
      result = result.filter(
        (space) =>
          scoreSpaceForIntent(space, parsedNlIntent) > 0 ||
          [
            space.title,
            space.description,
            space.city,
            space.suburb,
            buildAttributeSearchText(space.space_type, space.attributes || {}),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
      );
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

    const effectiveGroupSizeFilter = (() => {
      const manual = groupSizeFilter.trim();
      if (manual) {
        const bucket = parseGroupSizeBucketFilter(manual);
        if (bucket) {
          return { kind: "bucket" as const, ...bucket };
        }
        const n = Number(manual);
        if (Number.isFinite(n) && n > 0) {
          return { kind: "number" as const, value: n };
        }
      }
      if (parsedNlIntent.groupSize && parsedNlIntent.confidence !== "low") {
        return { kind: "number" as const, value: parsedNlIntent.groupSize };
      }
      return null;
    })();

    if (effectiveGroupSizeFilter?.kind === "bucket") {
      result = result.filter((space) =>
        spaceMatchesGroupSizeBucket(
          space,
          effectiveGroupSizeFilter.min,
          effectiveGroupSizeFilter.max
        )
      );
    } else if (effectiveGroupSizeFilter?.kind === "number") {
      result = result.filter((space) =>
        spaceMatchesGroupSize(space, effectiveGroupSizeFilter.value)
      );
    }

    result = result.filter((space) => {
      if (appliedWhen && !spaceMatchesWhenMinBooking(space, appliedWhen)) {
        return false;
      }

      if (!passesPublicBrowseListingGate(space)) {
        return false;
      }

      if (!explicitPriceFilter) {
        return true;
      }

      return spaceMatchesBrowsePriceRange(
        space,
        minPrice,
        maxPrice,
        bookingUnitFilter
      );
    });

    const searchQuery = search.trim() || parsedNlIntent.rawQuery;

    result.sort((a, b) => {
      const intentA = scoreSpaceForIntent(a, parsedNlIntent);
      const intentB = scoreSpaceForIntent(b, parsedNlIntent);
      if (intentA !== intentB) return intentB - intentA;

      const boostA = sportListingBoostScore({
        spaceType: a.space_type,
        attributes: a.attributes,
        query: searchQuery,
      });
      const boostB = sportListingBoostScore({
        spaceType: b.space_type,
        attributes: b.attributes,
        query: searchQuery,
      });
      if (boostA !== boostB) return boostB - boostA;

      const getComparablePrice = (space: Space) =>
        resolveSpacePriceAmount(space) ?? 0;

      const priceA = getComparablePrice(a);
      const priceB = getComparablePrice(b);

      if (sortBy === "price_low_high") return priceA - priceB;
      return priceB - priceA;
    });

    return result;
  }, [
    spaces,
    search,
    nlQuery,
    parsedNlIntent,
    sportTypeFilters,
    typeFilter,
    intentFilter,
    cityFilter,
    groupSizeFilter,
    bookingUnitFilter,
    appliedWhen,
    explicitPriceFilter,
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

  const refineFilterActiveCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== "all") count += 1;
    if (sportTypeFilters.length > 0) count += 1;
    if (search.trim()) count += 1;
    if (cityFilter !== "all") count += 1;
    if (appliedWhen) count += 1;
    if (groupSizeFilter.trim()) count += 1;
    const unit =
      bookingUnitFilter === "hour" ||
      bookingUnitFilter === "day" ||
      bookingUnitFilter === "month"
        ? bookingUnitFilter
        : "all";
    const defaultMax = getDefaultMax(unit);
    if (bookingUnitFilter !== "all" || minPrice !== 0 || maxPrice !== defaultMax) {
      count += 1;
    }
    return count;
  }, [
    typeFilter,
    sportTypeFilters,
    search,
    cityFilter,
    appliedWhen,
    groupSizeFilter,
    bookingUnitFilter,
    minPrice,
    maxPrice,
  ]);

  const primaryTypeChips = useMemo(
    () => [
      { key: "all", label: "All spaces", value: "all", icon: Sparkles },
      { key: "storage", label: "Storage", value: "storage", icon: Package },
      { key: "parking", label: "Parking", value: "parking", icon: Car },
      { key: "office", label: "Office", value: "office", icon: Briefcase },
      { key: "sport", label: "Sport", value: "sport_venue", icon: Dumbbell },
    ],
    []
  );

  const showSportTypeFilters =
    typeFilter === "sport_venue" ||
    sportTypeFilters.length > 0 ||
    parsedNlIntent.sportTypes.length > 0;

  function toggleSportTypeFilter(value: string) {
    const next = sportTypeFilters.includes(value)
      ? sportTypeFilters.filter((item) => item !== value)
      : [...sportTypeFilters, value];
    setSportTypeFilters(next);

    const p = new URLSearchParams(searchParamsString);
    if (next.length > 0) {
      p.set("sportType", next.join(","));
    } else {
      p.delete("sportType");
    }
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const moreTypeOptions = useMemo(() => {
    const primaryValues = new Set(primaryTypeChips.map((chip) => chip.value));
    return typeOptions.options.filter((opt) => !primaryValues.has(opt.value));
  }, [typeOptions.options, primaryTypeChips]);

  function clearNaturalLanguageSearch() {
    setNlInput("");
    setNlQuery("");
    const p = new URLSearchParams(searchParamsString);
    const resolved = resolveBrowseIntentParam(p.get("intent"));
    if (!resolved.browseIntentKey) {
      p.delete("intent");
    }
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function submitNaturalLanguageSearch() {
    const q = nlInput.trim();
    if (!q) return;
    const p = new URLSearchParams(searchParamsString);
    p.set("intent", q);
    setNlQuery(q);
    setIntentFilter(null);
    const qs = p.toString();
    router.push(`${pathname}?${qs}#browse-search`);
  }

  function clearAllFilters() {
    setSearch("");
    setNlInput("");
    setNlQuery("");
    setTypeFilter("all");
    setSportTypeFilters([]);
    setIntentFilter(null);
    setCityFilter("all");
    setGroupSizeFilter("");
    setSortBy("price_high_low");
    setAppliedWhen(null);
    setBookingUnitFilter("all");
    setMinPrice(0);
    setMaxPrice(getDefaultMax("all"));
    router.replace(pathname, { scroll: false });
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
      <section className="relative h-[72px] w-full overflow-hidden sm:h-[104px] md:h-[180px] lg:h-[200px]">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <Image
            src={heroBackgroundImage}
            alt=""
            fill
            priority
            quality={100}
            unoptimized
            sizes="(max-width: 768px) 100vw, 1920px"
            className="object-cover object-[center_40%] md:object-center"
          />
        </div>
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-center px-4 sm:px-6">
          <div className="max-w-xl rounded-xl border border-[#e5e7eb] bg-white/90 px-3.5 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.08)] sm:rounded-2xl sm:px-4 sm:py-2.5 md:px-5 md:py-3">
            <h1 className="text-xl font-semibold leading-tight text-[#0f172a] sm:text-2xl md:text-3xl">
              Browse spaces
            </h1>
            <p className="mt-0.5 hidden text-xs leading-snug text-[#475569] sm:block sm:text-sm">
              Find storage, parking, workspace, sport and event spaces near you.
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto -mt-5 max-w-6xl px-4 sm:-mt-8 sm:px-6 md:-mt-10">
        <div
          id="browse-search"
          className="scroll-mt-20 overflow-visible rounded-2xl border border-[#e5e7eb] bg-white p-2.5 shadow-[0_16px_40px_rgba(15,23,42,0.1)] sm:rounded-3xl sm:p-4"
        >
          <div className="rounded-xl border border-[#e8edf2] bg-[#f8fafc] p-2.5 sm:mb-3 sm:p-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <label
                htmlFor="nl-search-input"
                className="text-sm font-semibold text-[#0f172a]"
              >
                What do you need space for?
              </label>
              <div className="relative" ref={nlExamplesRef}>
                <button
                  type="button"
                  onClick={() => setShowNlExamples((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-full border border-[#e2e8f0] bg-white px-2 py-0.5 text-[11px] font-medium text-[#64748b] transition hover:border-[#cbd5e1] hover:text-[#334155] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/25"
                  aria-expanded={showNlExamples}
                  aria-haspopup="menu"
                >
                  <CircleHelp className="h-3 w-3" aria-hidden />
                  Examples
                </button>
                {showNlExamples ? (
                  <div
                    role="menu"
                    aria-label="Example searches"
                    className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(100vw-2rem,20rem)] rounded-xl border border-[#e1e6ea] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.14)] sm:w-72"
                  >
                    {NL_SEARCH_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setNlInput(example);
                          setShowNlExamples(false);
                        }}
                        className="flex w-full rounded-lg px-2.5 py-2 text-left text-xs text-[#334155] transition hover:bg-[#f8fafc] sm:text-sm"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="nl-search-input"
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitNaturalLanguageSearch();
                  }
                }}
                placeholder={NL_SEARCH_PLACEHOLDER}
                className="min-h-[44px] flex-1 rounded-xl border border-[#d4dbe2] bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                aria-label="Describe what you need space for"
              />
              <button
                type="button"
                onClick={submitNaturalLanguageSearch}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-[#c1121f] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a50f1a] sm:px-5"
              >
                Find spaces
              </button>
            </div>
            {nlQuery ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-2 text-xs text-[#1e3a5f] sm:text-sm">
                <span>
                  Showing spaces for:{" "}
                  <span className="font-medium">{intentSummary || nlQuery}</span>
                </span>
                {parsedNlIntent.confidence === "low" ? (
                  <span className="text-[11px] text-[#475569] sm:text-xs">
                    Showing broad matches. You can refine using filters.
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={clearNaturalLanguageSearch}
                  className="ml-auto text-[11px] font-semibold text-[#c1121f] underline sm:text-xs"
                >
                  Clear search
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setMobileRefineOpen((prev) => !prev)}
            className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition md:hidden ${
              refineFilterActiveCount > 0 && !mobileRefineOpen
                ? "border-[#c1121f]/30 bg-[#fff1f2] text-[#9f1239]"
                : "border-[#e2e8f0] bg-white text-[#334155] hover:border-[#cbd5e1] hover:bg-[#f8fafc]"
            }`}
            aria-expanded={mobileRefineOpen}
            aria-controls="browse-refine-filters"
          >
            {mobileRefineOpen ? "Hide filters" : "Refine search"}
            {!mobileRefineOpen && refineFilterActiveCount > 0 ? (
              <span className="text-xs font-normal text-[#64748b]">
                · {refineFilterActiveCount} active
              </span>
            ) : null}
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${mobileRefineOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          <div
            id="browse-refine-filters"
            className={mobileRefineOpen ? "mt-3 block md:mt-0" : "hidden md:block"}
          >
          <p className="mb-1.5 text-xs font-medium text-[#64748b]">Space type</p>

          <div className="relative z-10 mb-3 flex gap-1.5 overflow-x-auto overflow-y-visible py-0.5">
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
                  className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all duration-200 ${
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
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all duration-200 ${
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

          {showSportTypeFilters ? (
            <div className="mb-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#64748b]">
                Sport type
              </p>
              <div className="flex flex-wrap gap-2">
                {SPORT_TYPE_OPTIONS.map((opt) => {
                  const activeSportTypes =
                    sportTypeFilters.length > 0
                      ? sportTypeFilters
                      : parsedNlIntent.sportTypes;
                  const selected = activeSportTypes.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleSportTypeFilter(opt.value)}
                      className={`inline-flex min-h-[34px] items-center rounded-full border px-3 text-xs font-medium transition ${
                        selected
                          ? "border-[#047857] bg-[#ecfdf5] text-[#047857]"
                          : "border-[#d7dde3] bg-white text-[#475569] hover:border-[#b8c2cc]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

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

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_104px]">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium leading-4 text-[#475569]">Where do you need it?</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Location, suburb, city, or keyword"
                  className="min-h-[44px] w-full rounded-xl border border-[#d4dbe2] bg-white px-10 py-2 text-sm shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  aria-label="Location"
                />
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium leading-4 text-[#475569]">Rental period</p>
              <div className="min-h-[44px]">
                <BrowseWhenFilter
                  applied={appliedWhen}
                  availabilitySignal={panelAvailabilitySignal}
                  suggestedUnit={suggestedWhenUnit}
                  placeholderText="Select duration"
                  triggerClassName="min-h-[44px] h-[44px] w-full rounded-xl border border-[#d4dbe2] bg-white px-3 py-2 text-sm font-medium leading-5 text-[#334155] shadow-sm transition-all duration-200 hover:border-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#c1121f]/20"
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
              <p className="mb-1 text-xs font-medium leading-4 text-[#475569]">Group size</p>
              <select
                value={groupSizeFilter}
                onChange={(e) => setGroupSizeFilter(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-[#d4dbe2] bg-white px-3 py-2 text-sm shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                aria-label="Group size"
              >
                <option value="">Any group size</option>
                {GROUP_SIZE_FILTER_BUCKETS.map((bucket) => (
                  <option key={bucket.value} value={bucket.value}>
                    {bucket.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium leading-4 text-[#475569]">Price range</p>
              <button
                type="button"
                onClick={openPriceModal}
                className="inline-flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[#d4dbe2] bg-white px-3 text-sm text-[#334155] shadow-sm transition-all duration-200 hover:border-[#cbd5e1] hover:bg-[#fafafa]"
              >
                <span className="truncate">
                  {bookingUnitFilter === "all" ? "All units" : bookingUnitFilter} · R{minPrice} - R{maxPrice}
                </span>
                <SlidersHorizontal className="h-4 w-4 text-[#64748b]" />
              </button>
            </div>

            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium leading-4 text-transparent">Search</p>
              <button
                type="button"
                onClick={() => pushBrowseUrl(appliedWhen)}
                className="min-h-[44px] w-full rounded-xl bg-[#c1121f] px-4 text-sm font-semibold text-white shadow-[0_8px_16px_rgba(193,18,31,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#a70f19] hover:shadow-[0_12px_20px_rgba(193,18,31,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2"
              >
                Search
              </button>
            </div>
          </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-3 max-w-7xl px-4 sm:mt-4 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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

        <div className="mt-8 border-t border-[#edf1f5] pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-8 sm:gap-y-2">
            <div className="flex items-center gap-2 text-xs text-[#475569] sm:text-sm">
              <span className="inline-flex rounded-md border border-[#f0d5d8] bg-[#fff6f7] p-1.5 text-[#c1121f]">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span>
                <span className="font-semibold text-[#0f172a]">Verified spaces</span>
                <span className="hidden sm:inline"> — Owners are reviewed before listings go live.</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#475569] sm:text-sm">
              <span className="inline-flex rounded-md border border-[#f0d5d8] bg-[#fff6f7] p-1.5 text-[#c1121f]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span>
                <span className="font-semibold text-[#0f172a]">Secure booking</span>
                <span className="hidden sm:inline"> — Bookings and payments follow a secure process.</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#475569] sm:text-sm">
              <span className="inline-flex rounded-md border border-[#f0d5d8] bg-[#fff6f7] p-1.5 text-[#c1121f]">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span>
                <span className="font-semibold text-[#0f172a]">Approved listings</span>
                <span className="hidden sm:inline"> — Spaces are checked before being made available.</span>
              </span>
            </div>
          </div>
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