import type { Space } from "@/lib/spaceFilters";

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

type PrimaryFilterInput = {
  search?: string;
  type?: string;
  city?: string;
  suburb?: string;
};

export function applyPrimaryFilters(
  spaces: Space[],
  {
    search = "",
    type = "all",
    city = "all",
    suburb = "all",
  }: PrimaryFilterInput
) {
  const normalizedSearch = normalize(search);
  const normalizedType = normalize(type);
  const normalizedCity = normalize(city);
  const normalizedSuburb = normalize(suburb);

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

    return matchesSearch && matchesType && matchesCity && matchesSuburb;
  });
}