export type Space = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  suburb: string | null;
  street_address: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  address_line_1: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  booking_unit: string | null;
  space_type: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  image_urls: string[];
  attributes: Record<string, string[]>;
  created_at?: string | null;
};

export type SpaceFilterInput = {
  search?: string;
  typeFilter?: string;
  cityFilter?: string;
  suburbFilter?: string;
  bookingUnitFilter?: string;
  minPrice?: number;
  maxPrice?: number;
  accessFilters?: string[];
  securityFilters?: string[];
};

export function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function matchesMultiFilter(
  spaceValues: string[],
  selectedFilters: string[]
) {
  if (selectedFilters.length === 0) return true;

  const normalizedValues = spaceValues.map(normalize);
  const normalizedFilters = selectedFilters.map(normalize);

  return normalizedFilters.every((filter) =>
    normalizedValues.includes(filter)
  );
}

export function getComparablePrice(space: Space, bookingUnitFilter: string) {
  if (bookingUnitFilter === "hour") return space.price_per_hour;
  if (bookingUnitFilter === "day") return space.price_per_day;
  if (bookingUnitFilter === "month") return space.price_per_month;
  return null;
}

export function getAllComparablePrices(space: Space) {
  return [
    space.price_per_hour,
    space.price_per_day,
    space.price_per_month,
  ].filter((price): price is number => price !== null && price > 0);
}

export function getPriceCap(bookingUnitFilter: string) {
  if (bookingUnitFilter === "hour") return 5000;
  if (bookingUnitFilter === "day") return 20000;
  if (bookingUnitFilter === "month") return 100000;
  return 100000;
}

export function filterSpaces(
  spaces: Space[],
  {
    search = "",
    typeFilter = "all",
    cityFilter = "all",
    suburbFilter = "all",
    bookingUnitFilter = "all",
    minPrice = 0,
    maxPrice,
    accessFilters = [],
    securityFilters = [],
  }: SpaceFilterInput
) {
  const normalizedSearch = normalize(search);
  const normalizedType = normalize(typeFilter);
  const normalizedCity = normalize(cityFilter);
  const normalizedSuburb = normalize(suburbFilter);
  const normalizedBookingUnit = normalize(bookingUnitFilter);

  // ✅ THIS IS THE FIX
  const effectiveMaxPrice =
    maxPrice ?? getPriceCap(normalizedBookingUnit);

  return spaces.filter((space) => {
    const matchesSearch =
      !normalizedSearch ||
      normalize(space.title).includes(normalizedSearch) ||
      normalize(space.city).includes(normalizedSearch) ||
      normalize(space.suburb).includes(normalizedSearch) ||
      normalize(space.street_address).includes(normalizedSearch) ||
      normalize(space.province).includes(normalizedSearch) ||
      normalize(space.address_line_1).includes(normalizedSearch) ||
      normalize(space.description).includes(normalizedSearch);

    const matchesType =
      normalizedType === "all" || normalize(space.space_type) === normalizedType;

    const matchesCity =
      normalizedCity === "all" || normalize(space.city) === normalizedCity;

    const matchesSuburb =
      normalizedSuburb === "all" || normalize(space.suburb) === normalizedSuburb;

    const accessValues = space.attributes["access_options"] || [];
    const securityValues = space.attributes["security_features"] || [];

    const matchesAccess = matchesMultiFilter(accessValues, accessFilters);
    const matchesSecurity = matchesMultiFilter(
      securityValues,
      securityFilters
    );

    let matchesPrice = false;

    if (normalizedBookingUnit === "all") {
      const prices = getAllComparablePrices(space);
      matchesPrice = prices.some(
        (price) => price >= minPrice && price <= effectiveMaxPrice
      );
    } else {
      const price = getComparablePrice(space, normalizedBookingUnit);
      matchesPrice =
        price !== null && price >= minPrice && price <= effectiveMaxPrice;
    }

    return (
      matchesSearch &&
      matchesType &&
      matchesCity &&
      matchesSuburb &&
      matchesAccess &&
      matchesSecurity &&
      matchesPrice
    );
  });
}

export function sortSpaces(
  spaces: Space[],
  sortBy: string,
  bookingUnitFilter: string
) {
  const sorted = [...spaces];

  if (sortBy === "price_low_high") {
    sorted.sort((a, b) => {
      const priceA =
        bookingUnitFilter === "all"
          ? Math.min(...getAllComparablePrices(a), Number.MAX_SAFE_INTEGER)
          : (getComparablePrice(a, bookingUnitFilter) ??
            Number.MAX_SAFE_INTEGER);

      const priceB =
        bookingUnitFilter === "all"
          ? Math.min(...getAllComparablePrices(b), Number.MAX_SAFE_INTEGER)
          : (getComparablePrice(b, bookingUnitFilter) ??
            Number.MAX_SAFE_INTEGER);

      return priceA - priceB;
    });

    return sorted;
  }

  sorted.sort((a, b) => {
    const pricesA =
      bookingUnitFilter === "all" ? getAllComparablePrices(a) : [];
    const pricesB =
      bookingUnitFilter === "all" ? getAllComparablePrices(b) : [];

    const priceA =
      bookingUnitFilter === "all"
        ? pricesA.length > 0
          ? Math.max(...pricesA)
          : -1
        : (getComparablePrice(a, bookingUnitFilter) ?? -1);

    const priceB =
      bookingUnitFilter === "all"
        ? pricesB.length > 0
          ? Math.max(...pricesB)
          : -1
        : (getComparablePrice(b, bookingUnitFilter) ?? -1);

    return priceB - priceA;
  });

  return sorted;
}