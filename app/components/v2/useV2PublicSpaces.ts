"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  PUBLIC_LISTING_MODE_ENQUIRY,
  PUBLIC_LISTING_MODE_LIVE,
} from "@/lib/public-listing-mode";
import {
  passesPublicBrowseListingGate,
  type PublicBrowseEligibilityInput,
} from "@/lib/public-browse-eligibility";
import { PUBLIC_SPACE_SELECT } from "@/lib/public-space-columns";
import type { V2PublicSpaceCardData } from "./V2SpaceCard";

export type V2PublicSpace = V2PublicSpaceCardData &
  PublicBrowseEligibilityInput & {
    description?: string | null;
    address_line_1?: string | null;
    street_address?: string | null;
    province?: string | null;
    min_group_size?: number | null;
    max_group_size?: number | null;
    created_at?: string | null;
    attributes: Record<string, string[]>;
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

export function useV2PublicSpaces(options?: { limit?: number }) {
  const limit = options?.limit;
  const [spaces, setSpaces] = useState<V2PublicSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSpaces() {
      let query = supabase
        .from("spaces")
        .select(PUBLIC_SPACE_SELECT)
        .in("public_listing_mode", [
          PUBLIC_LISTING_MODE_ENQUIRY,
          PUBLIC_LISTING_MODE_LIVE,
        ])
        .order("created_at", { ascending: false });

      if (limit) query = query.limit(limit);

      const { data, error: spacesError } = await query;
      if (!active) return;
      if (spacesError) {
        setError(spacesError.message);
        setLoading(false);
        return;
      }

      const eligibleSpaces = (
        (data || []) as unknown as Array<
          Omit<V2PublicSpace, "image_urls" | "attributes">
        >
      ).filter((space) => passesPublicBrowseListingGate(space));
      const spaceIds = eligibleSpaces.map((space) => space.id);
      const imageMap = new Map<string, string[]>();
      const attributeMap = new Map<string, Record<string, string[]>>();

      if (spaceIds.length > 0) {
        const [imagesResult, attributesResult] = await Promise.all([
          supabase
            .from("space_images")
            .select("space_id, image_url, sort_order")
            .in("space_id", spaceIds)
            .order("sort_order", { ascending: true }),
          supabase
            .from("space_attributes")
            .select("space_id, attribute_key, attribute_value")
            .in("space_id", spaceIds),
        ]);

        if (!active) return;
        if (imagesResult.error || attributesResult.error) {
          setError(
            imagesResult.error?.message ||
              attributesResult.error?.message ||
              "Could not load public space details."
          );
          setLoading(false);
          return;
        }

        for (const row of (imagesResult.data || []) as SpaceImageRow[]) {
          const images = imageMap.get(row.space_id) || [];
          images.push(row.image_url);
          imageMap.set(row.space_id, images);
        }

        for (const row of (attributesResult.data || []) as SpaceAttributeRow[]) {
          if (!row.attribute_value) continue;
          const attributes = attributeMap.get(row.space_id) || {};
          const values = attributes[row.attribute_key] || [];
          values.push(row.attribute_value);
          attributes[row.attribute_key] = values;
          attributeMap.set(row.space_id, attributes);
        }
      }

      setSpaces(
        eligibleSpaces.map((space) => ({
          ...space,
          image_urls: imageMap.get(space.id) || [],
          attributes: attributeMap.get(space.id) || {},
        }))
      );
      setLoading(false);
    }

    void loadSpaces();
    return () => {
      active = false;
    };
  }, [limit]);

  return { spaces, loading, error };
}
