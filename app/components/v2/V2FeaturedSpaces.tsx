"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
import V2SpaceCard, {
  type V2PublicSpaceCardData,
} from "./V2SpaceCard";

type LandingSpace = V2PublicSpaceCardData &
  PublicBrowseEligibilityInput & {
    created_at?: string | null;
  };

type SpaceImageRow = {
  space_id: string;
  image_url: string;
  sort_order: number | null;
};

export default function V2FeaturedSpaces() {
  const [spaces, setSpaces] = useState<LandingSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSpaces() {
      const { data, error } = await supabase
        .from("spaces")
        .select(PUBLIC_SPACE_SELECT)
        .in("public_listing_mode", [
          PUBLIC_LISTING_MODE_ENQUIRY,
          PUBLIC_LISTING_MODE_LIVE,
        ])
        .order("created_at", { ascending: false })
        .limit(18);

      if (!active) return;
      if (error) {
        setFailed(true);
        setLoading(false);
        return;
      }

      const eligibleSpaces = (
        (data || []) as unknown as Array<
          Omit<LandingSpace, "image_urls">
        >
      ).filter((space) => passesPublicBrowseListingGate(space));
      const spaceIds = eligibleSpaces.map((space) => space.id);
      const imageMap = new Map<string, string[]>();

      if (spaceIds.length > 0) {
        const { data: imageRows } = await supabase
          .from("space_images")
          .select("space_id, image_url, sort_order")
          .in("space_id", spaceIds)
          .order("sort_order", { ascending: true });

        if (!active) return;
        for (const row of (imageRows || []) as SpaceImageRow[]) {
          const images = imageMap.get(row.space_id) || [];
          images.push(row.image_url);
          imageMap.set(row.space_id, images);
        }
      }

      const nextSpaces = eligibleSpaces
        .map((space) => ({
          ...space,
          image_urls: imageMap.get(space.id) || [],
        }))
        .sort(
          (left, right) =>
            Number(right.image_urls.length > 0) -
            Number(left.image_urls.length > 0)
        )
        .slice(0, 6);

      setSpaces(nextSpaces);
      setLoading(false);
    }

    void loadSpaces();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="fms-v2-home-section" aria-labelledby="featured-spaces">
      <div className="fms-v2-section-heading">
        <div>
          <p className="fms-v2-eyebrow">Discover</p>
          <h2 id="featured-spaces">Spaces worth exploring</h2>
        </div>
        <Link href="/spaces" className="fms-v2-text-link">
          Browse all
          <ArrowRight aria-hidden />
        </Link>
      </div>

      {loading ? (
        <div className="fms-v2-space-grid" aria-label="Loading spaces">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="fms-v2-space-card-skeleton"
              aria-hidden
            />
          ))}
        </div>
      ) : spaces.length > 0 ? (
        <div className="fms-v2-space-grid">
          {spaces.map((space) => (
            <V2SpaceCard key={space.id} space={space} />
          ))}
        </div>
      ) : (
        <div className="fms-v2-empty-discovery">
          <p>
            {failed
              ? "Spaces could not be loaded right now."
              : "New spaces are being prepared."}
          </p>
          <Link href="/spaces">Open Browse Spaces</Link>
        </div>
      )}
    </section>
  );
}
