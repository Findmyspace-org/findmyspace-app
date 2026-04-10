"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const SpacesMap = dynamic(() => import("@/app/components/SpacesMap"), {
  ssr: false,
});

type SpaceAttributeRow = {
  space_id: string;
  attribute_key: string;
  attribute_value: string | null;
};

type SpaceRow = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  booking_unit: string | null;
  space_type: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at?: string | null;
};

type SpaceImageRow = {
  space_id: string;
  image_url: string;
  sort_order: number | null;
};

type Space = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  suburb: string | null;
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

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export default function SpacesMapPage() {
  const searchParams = useSearchParams();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [message, setMessage] = useState("");

  const search = normalize(searchParams.get("q") || "");
  const typeFilter = normalize(searchParams.get("type") || "all");
  const cityFilter = normalize(searchParams.get("city") || "all");
  const suburbFilter = normalize(searchParams.get("suburb") || "all");

  useEffect(() => {
    fetchSpaces();
  }, []);

  async function fetchSpaces() {
    const { data, error } = await supabase
      .from("spaces")
      .select(
        "id, title, description, city, suburb, address_line_1, price_per_hour, price_per_day, price_per_month, booking_unit, space_type, status, latitude, longitude, created_at"
      )
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    const spacesData = ((data || []) as unknown) as SpaceRow[];
    const spaceIds = spacesData.map((space) => space.id);

    const imageMap = new Map<string, string[]>();
    const attributeMap = new Map<string, Record<string, string[]>>();

    if (spaceIds.length > 0) {
      const { data: imagesData, error: imagesError } = await supabase
        .from("space_images")
        .select("space_id, image_url, sort_order")
        .in("space_id", spaceIds)
        .order("sort_order", { ascending: true });

      if (imagesError) {
        setMessage(imagesError.message);
        return;
      }

      for (const img of (((imagesData || []) as unknown) as SpaceImageRow[])) {
        const current = imageMap.get(img.space_id) || [];
        current.push(img.image_url);
        imageMap.set(img.space_id, current);
      }

      const { data: attributesData, error: attributesError } = await supabase
        .from("space_attributes")
        .select("space_id, attribute_key, attribute_value")
        .in("space_id", spaceIds);

      if (attributesError) {
        setMessage(attributesError.message);
        return;
      }

      (((attributesData || []) as unknown) as SpaceAttributeRow[]).forEach((row) => {
        if (!row.attribute_value) return;

        const current = attributeMap.get(row.space_id) || {};

        if (!current[row.attribute_key]) {
          current[row.attribute_key] = [];
        }

        current[row.attribute_key].push(row.attribute_value);
        attributeMap.set(row.space_id, current);
      });
    }

    const merged: Space[] = spacesData.map((space) => ({
      ...space,
      image_urls: imageMap.get(space.id) || [],
      attributes: attributeMap.get(space.id) || {},
    }));

    setSpaces(merged);
  }

  const filteredSpaces = useMemo(() => {
    return spaces.filter((space) => {
      const matchesSearch =
        !search ||
        normalize(space.title).includes(search) ||
        normalize(space.description).includes(search) ||
        normalize(space.address_line_1).includes(search) ||
        normalize(space.suburb).includes(search) ||
        normalize(space.city).includes(search);

      const matchesType =
        typeFilter === "all" || normalize(space.space_type) === typeFilter;

      const matchesCity =
        cityFilter === "all" || normalize(space.city) === cityFilter;

      const matchesSuburb =
        suburbFilter === "all" || normalize(space.suburb) === suburbFilter;

      return matchesSearch && matchesType && matchesCity && matchesSuburb;
    });
  }, [spaces, search, typeFilter, cityFilter, suburbFilter]);

  const mapSpaces = filteredSpaces.filter(
    (space) => space.latitude !== null && space.longitude !== null
  );

  const backQueryString = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    return params.toString();
  }, [searchParams]);

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="mb-2 text-4xl font-bold">Map view</h1>
            <p className="text-gray-600">
              Explore your filtered FindMySpace results on the map.
            </p>
          </div>

          <Link
            href={backQueryString ? `/spaces?${backQueryString}` : "/spaces"}
            className="rounded-lg border px-4 py-3 text-sm font-medium"
          >
            Back to listings
          </Link>
        </div>

        {message && (
          <div className="mb-6 rounded-lg bg-gray-100 p-3 text-sm text-gray-800">
            {message}
          </div>
        )}

        <div className="mb-4 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600">
          {filteredSpaces.length} space{filteredSpaces.length === 1 ? "" : "s"} found
          {mapSpaces.length !== filteredSpaces.length && (
            <span className="ml-2 text-gray-500">
              ({mapSpaces.length} with map locations)
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-gray-300 p-4 shadow-sm">
          {mapSpaces.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-6 text-sm text-gray-600">
              No mapped spaces match your search.
            </div>
          ) : (
            <SpacesMap spaces={mapSpaces} />
          )}
        </div>
      </div>
    </main>
  );
}