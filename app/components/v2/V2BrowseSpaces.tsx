"use client";

import Link from "next/link";
import {
  ArrowUpDown,
  Map,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  LISTING_SPACE_TYPE_OPTIONS,
  buildAttributeSearchText,
} from "@/app/data/spaceFeatureConfig";
import {
  GROUP_SIZE_FILTER_BUCKETS,
  parseGroupSizeBucketFilter,
  spaceMatchesGroupSize,
  spaceMatchesGroupSizeBucket,
} from "@/lib/group-size";
import { resolveSpacePriceAmount } from "@/lib/space-pricing";
import {
  getIntentDefinition,
  parseIntent,
  SPACE_INTENTS,
} from "@/lib/space-intents";
import { sportSearchHaystackExtras } from "@/lib/sport-search";
import {
  V2_BROWSE_HREF,
  V2_BROWSE_PATH,
} from "@/lib/v2/ui-version";
import V2SpaceCard from "./V2SpaceCard";
import { V2Container } from "./V2Primitives";
import { useV2PublicSpaces } from "./useV2PublicSpaces";

const DEFAULT_SORT = "price_high_low";

function hiddenValue(value: string) {
  return value && value !== "all" ? value : "";
}

export default function V2BrowseSpaces() {
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { spaces, loading, error } = useV2PublicSpaces();

  const search = searchParams.get("q")?.trim() || "";
  const intent = parseIntent(searchParams.get("intent"));
  const typeFilter = searchParams.get("type") || "all";
  const groupSizeFilter = searchParams.get("groupSize") || "";
  const sort = searchParams.get("sort") || DEFAULT_SORT;

  function browseHref(
    overrides: Record<string, string | null | undefined>
  ) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("ui", "v2");
    for (const [key, value] of Object.entries(overrides)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `${V2_BROWSE_PATH}?${next.toString()}`;
  }

  const filteredSpaces = useMemo(() => {
    let result = [...spaces];

    if (search) {
      const query = search.toLowerCase();
      result = result.filter((space) => {
        const haystack = [
          space.title,
          space.description,
          space.address_line_1,
          space.street_address,
          space.suburb,
          space.city,
          space.province,
          buildAttributeSearchText(space.space_type, space.attributes),
          sportSearchHaystackExtras(space.space_type, space.attributes),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    if (typeFilter !== "all") {
      result = result.filter((space) => space.space_type === typeFilter);
    } else if (intent) {
      const definition = getIntentDefinition(intent);
      if (definition) {
        const allowedTypes = new Set(definition.mappedSpaceTypes);
        result = result.filter((space) =>
          allowedTypes.has((space.space_type || "").toLowerCase())
        );
      }
    }

    if (groupSizeFilter) {
      const bucket = parseGroupSizeBucketFilter(groupSizeFilter);
      if (bucket) {
        result = result.filter((space) =>
          spaceMatchesGroupSizeBucket(space, bucket.min, bucket.max)
        );
      } else {
        const size = Number(groupSizeFilter);
        if (Number.isFinite(size) && size > 0) {
          result = result.filter((space) =>
            spaceMatchesGroupSize(space, size)
          );
        }
      }
    }

    result.sort((left, right) => {
      const leftPrice = resolveSpacePriceAmount(left) ?? 0;
      const rightPrice = resolveSpacePriceAmount(right) ?? 0;
      if (sort === "price_low_high") return leftPrice - rightPrice;
      return rightPrice - leftPrice;
    });

    return result;
  }, [groupSizeFilter, intent, search, sort, spaces, typeFilter]);

  const activeFilterCount =
    Number(Boolean(intent)) +
    Number(typeFilter !== "all") +
    Number(Boolean(groupSizeFilter));
  const mapCompatible = !intent && !groupSizeFilter;
  const classicMapParams = new URLSearchParams();
  if (search) classicMapParams.set("q", search);
  if (typeFilter !== "all") classicMapParams.set("type", typeFilter);
  const classicMapHref = classicMapParams.size
    ? `/spaces/map?${classicMapParams.toString()}`
    : "/spaces/map";

  const filterFields = (
    <>
      <label>
        <span>Space type</span>
        <select name="type" defaultValue={typeFilter}>
          <option value="all">All space types</option>
          {LISTING_SPACE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Group size</span>
        <select name="groupSize" defaultValue={groupSizeFilter}>
          <option value="">Any group size</option>
          {GROUP_SIZE_FILTER_BUCKETS.map((bucket) => (
            <option key={bucket.value} value={bucket.value}>
              {bucket.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Sort</span>
        <span className="fms-v2-select-with-icon">
          <ArrowUpDown aria-hidden />
          <select name="sort" defaultValue={sort}>
            <option value="price_high_low">Featured</option>
            <option value="price_low_high">Price: low to high</option>
          </select>
        </span>
      </label>
    </>
  );

  return (
    <V2Container>
      <section className="fms-v2-browse" aria-labelledby="v2-browse-heading">
        <header className="fms-v2-browse-heading">
          <p className="fms-v2-eyebrow">FindMySpace</p>
          <h1 id="v2-browse-heading">Browse spaces</h1>
          <p>Find a space that fits where you are and what you need.</p>
        </header>

        <form
          action={V2_BROWSE_PATH}
          method="get"
          className="fms-v2-browse-search"
          role="search"
        >
          <input type="hidden" name="ui" value="v2" />
          <input
            type="hidden"
            name="intent"
            value={hiddenValue(intent || "")}
          />
          <input
            type="hidden"
            name="type"
            value={hiddenValue(typeFilter)}
          />
          <input type="hidden" name="groupSize" value={groupSizeFilter} />
          <input type="hidden" name="sort" value={sort} />
          <label htmlFor="v2-browse-search" className="fms-v2-sr-only">
            Where are you looking?
          </label>
          <Search aria-hidden />
          <input
            key={search}
            id="v2-browse-search"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Where are you looking?"
          />
          <button type="submit">Search</button>
        </form>

        <div className="fms-v2-browse-intents" aria-label="Space categories">
          <Link
            href={browseHref({ intent: null })}
            aria-current={!intent ? "page" : undefined}
          >
            All spaces
          </Link>
          {SPACE_INTENTS.map((item) => (
            <Link
              key={item.key}
              href={browseHref({ intent: item.key, type: null })}
              aria-current={intent === item.key ? "page" : undefined}
            >
              {item.shortLabel}
            </Link>
          ))}
        </div>

        <form
          action={V2_BROWSE_PATH}
          method="get"
          className="fms-v2-browse-filter-bar"
        >
          <input type="hidden" name="ui" value="v2" />
          <input type="hidden" name="q" value={search} />
          <input
            type="hidden"
            name="intent"
            value={hiddenValue(intent || "")}
          />
          <div className="fms-v2-desktop-filter-fields">{filterFields}</div>
          <button type="submit" className="fms-v2-apply-filters">
            Apply
          </button>
        </form>

        <div className="fms-v2-browse-mobile-actions">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="fms-v2-filter-button"
          >
            <SlidersHorizontal aria-hidden />
            Filters
            {activeFilterCount > 0 ? <span>{activeFilterCount}</span> : null}
          </button>
          {mapCompatible ? (
            <Link href={classicMapHref} className="fms-v2-map-link">
              <Map aria-hidden />
              Map
            </Link>
          ) : null}
        </div>

        <div className="fms-v2-results-heading">
          <p>
            {loading
              ? "Finding spaces…"
              : `${filteredSpaces.length} space${
                  filteredSpaces.length === 1 ? "" : "s"
                }`}
          </p>
          {search || activeFilterCount > 0 ? (
            <Link href={V2_BROWSE_HREF}>
              <X aria-hidden />
              Clear
            </Link>
          ) : null}
        </div>

        {loading ? (
          <div className="fms-v2-browse-grid" aria-label="Loading spaces">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div
                key={item}
                className="fms-v2-space-card-skeleton"
                aria-hidden
              />
            ))}
          </div>
        ) : error ? (
          <div className="fms-v2-browse-state" role="alert">
            <h2>Spaces could not be loaded</h2>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : filteredSpaces.length === 0 ? (
          <div className="fms-v2-browse-state">
            <h2>No spaces found</h2>
            <p>Try changing your search or filters.</p>
            <Link href={V2_BROWSE_HREF}>Clear filters</Link>
          </div>
        ) : (
          <div className="fms-v2-browse-grid">
            {filteredSpaces.map((space) => (
              <V2SpaceCard key={space.id} space={space} />
            ))}
          </div>
        )}
      </section>

      {filtersOpen ? (
        <div className="fms-v2-filter-sheet-layer">
          <button
            type="button"
            className="fms-v2-filter-sheet-backdrop"
            onClick={() => setFiltersOpen(false)}
            aria-label="Close filters"
          />
          <form
            action={V2_BROWSE_PATH}
            method="get"
            className="fms-v2-filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Browse filters"
          >
            <div className="fms-v2-filter-sheet-heading">
              <div>
                <p className="fms-v2-eyebrow">Refine</p>
                <h2>Filters</h2>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
              >
                <X aria-hidden />
              </button>
            </div>
            <input type="hidden" name="ui" value="v2" />
            <input type="hidden" name="q" value={search} />
            <input
              type="hidden"
              name="intent"
              value={hiddenValue(intent || "")}
            />
            <div className="fms-v2-mobile-filter-fields">{filterFields}</div>
            <div className="fms-v2-filter-sheet-actions">
              <Link href={V2_BROWSE_HREF}>Clear</Link>
              <button type="submit">Show spaces</button>
            </div>
          </form>
        </div>
      ) : null}
    </V2Container>
  );
}
