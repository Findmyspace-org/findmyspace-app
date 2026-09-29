"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { V2_BROWSE_HREF } from "@/lib/v2/ui-version";
import V2SpaceCard from "./V2SpaceCard";
import { useV2PublicSpaces } from "./useV2PublicSpaces";

export default function V2FeaturedSpaces() {
  const { spaces, loading, error } = useV2PublicSpaces({ limit: 18 });
  const featuredSpaces = useMemo(
    () =>
      [...spaces]
        .sort(
          (left, right) =>
            Number(right.image_urls.length > 0) -
            Number(left.image_urls.length > 0)
        )
        .slice(0, 6),
    [spaces]
  );

  return (
    <section className="fms-v2-home-section" aria-labelledby="featured-spaces">
      <div className="fms-v2-section-heading">
        <div>
          <p className="fms-v2-eyebrow">Discover</p>
          <h2 id="featured-spaces">Spaces worth exploring</h2>
        </div>
        <Link href={V2_BROWSE_HREF} className="fms-v2-text-link">
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
      ) : featuredSpaces.length > 0 ? (
        <div className="fms-v2-space-grid">
          {featuredSpaces.map((space) => (
            <V2SpaceCard key={space.id} space={space} />
          ))}
        </div>
      ) : (
        <div className="fms-v2-empty-discovery">
          <p>
            {error
              ? "Spaces could not be loaded right now."
              : "New spaces are being prepared."}
          </p>
          <Link href={V2_BROWSE_HREF}>Open Browse Spaces</Link>
        </div>
      )}
    </section>
  );
}
