import type { Metadata } from "next";
import { isSpacePubliclyVisible } from "@/lib/public-listing-mode";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";
import { sortSpaceImages } from "@/lib/sort-space-images";

export const PRIVATE_SPACE_SHARE_TITLE = "FindMySpace";
export const PRIVATE_SPACE_SHARE_DESCRIPTION =
  "Find your space in the right place.";

/** Personalised share description for public listings. */
export function formatPublicSpaceShareDescription(spaceTitle: string): string {
  return `Book this space, ${spaceTitle}, on FindMySpace: The right space in the right place.`;
}

/** Branded OG/Twitter fallback when a listing has no cover image. */
export const FALLBACK_SHARE_IMAGE_PATH = "/images/findmyspace-share-card.jpg";

/** FindMySpace PNG logo used on dynamic OG images. */
export const FINDMYSPACE_LOGO_PATH = "/logo.png";

export const SPACE_OG_TAGLINE = "The right space in the right place";

export const SPACE_OG_IMAGE_WIDTH = 1200;
export const SPACE_OG_IMAGE_HEIGHT = 630;

export type SpaceShareMetadataInput = {
  id: string;
  title?: string | null;
  public_listing_mode?: string | null;
  coverImageId?: string | null;
};

export type SpaceImageRow = {
  id: string;
  image_url: string;
  sort_order: number | null;
};

/** Resolve a path or URL to an absolute public URL for og:image / twitter:image. */
export function toAbsolutePublicUrl(
  pathOrUrl: string,
  siteUrl = getCanonicalPublicSiteUrl()
): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return `${siteUrl}${FALLBACK_SHARE_IMAGE_PATH}`;

  if (/^https?:\/\//i.test(trimmed)) {
    if (
      process.env.NODE_ENV === "production" &&
      trimmed.toLowerCase().startsWith("http://")
    ) {
      return trimmed.replace(/^http:\/\//i, "https://");
    }
    return trimmed;
  }

  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${siteUrl}${path}`;
}

/** First gallery image by sort_order (same ordering as browse cards). */
export function resolveSpaceCoverImageUrl(
  images: SpaceImageRow[],
  siteUrl = getCanonicalPublicSiteUrl()
): string {
  const sorted = sortSpaceImages(images);
  const cover = sorted[0]?.image_url?.trim();
  if (cover) return toAbsolutePublicUrl(cover, siteUrl);
  return toAbsolutePublicUrl(FALLBACK_SHARE_IMAGE_PATH, siteUrl);
}

/** Cover from pre-sorted public image URLs (e.g. browse card / detail page). */
export function resolveSpaceCoverImageUrlFromUrls(
  imageUrls: string[],
  siteUrl = getCanonicalPublicSiteUrl()
): string {
  const cover = imageUrls[0]?.trim();
  if (cover) return toAbsolutePublicUrl(cover, siteUrl);
  return toAbsolutePublicUrl(FALLBACK_SHARE_IMAGE_PATH, siteUrl);
}

/** Absolute URL for the dynamic branded OG image route. */
export function buildSpaceOgImageUrl(
  spaceId: string,
  coverImageId?: string | null,
  siteUrl = getCanonicalPublicSiteUrl()
): string {
  const base = `${siteUrl}/api/og/space/${spaceId}`;
  const version = coverImageId?.trim();
  if (version) return `${base}?v=${encodeURIComponent(version)}`;
  return base;
}

function resolveCoverFromImages(images: SpaceImageRow[]): {
  hasCover: boolean;
  coverImageId: string | null;
} {
  const sorted = sortSpaceImages(images);
  const cover = sorted[0];
  const url = cover?.image_url?.trim();
  if (!url) return { hasCover: false, coverImageId: null };
  return { hasCover: true, coverImageId: cover.id };
}

/** Share image for metadata: dynamic OG route when cover exists, else static fallback. */
export function resolvePublicSpaceShareImageUrl(input: {
  spaceId: string;
  coverImageId?: string | null;
  imageUrls?: string[];
  images?: SpaceImageRow[];
  siteUrl?: string;
}): string {
  const siteUrl = input.siteUrl ?? getCanonicalPublicSiteUrl();

  let hasCover = false;
  let coverImageId = input.coverImageId?.trim() || null;

  if (input.images?.length) {
    const resolved = resolveCoverFromImages(input.images);
    hasCover = resolved.hasCover;
    coverImageId = resolved.coverImageId ?? coverImageId;
  } else if (input.imageUrls?.some((url) => url?.trim())) {
    hasCover = true;
  }

  if (!hasCover) {
    return toAbsolutePublicUrl(FALLBACK_SHARE_IMAGE_PATH, siteUrl);
  }

  return buildSpaceOgImageUrl(input.spaceId, coverImageId, siteUrl);
}

function buildPrivateSpaceMetadata(
  spaceId: string,
  siteUrl: string
): Metadata {
  const pageUrl = `${siteUrl}/spaces/${spaceId}`;
  const imageUrl = toAbsolutePublicUrl(FALLBACK_SHARE_IMAGE_PATH, siteUrl);

  return {
    title: PRIVATE_SPACE_SHARE_TITLE,
    description: PRIVATE_SPACE_SHARE_DESCRIPTION,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: PRIVATE_SPACE_SHARE_TITLE,
      description: PRIVATE_SPACE_SHARE_DESCRIPTION,
      url: pageUrl,
      type: "website",
      siteName: "FindMySpace",
      images: [{ url: imageUrl, alt: "FindMySpace" }],
    },
    twitter: {
      card: "summary_large_image",
      title: PRIVATE_SPACE_SHARE_TITLE,
      description: PRIVATE_SPACE_SHARE_DESCRIPTION,
      images: [imageUrl],
    },
  };
}

export function buildPublicSpaceShareMetadata(input: {
  space: SpaceShareMetadataInput;
  imageUrls?: string[];
  images?: SpaceImageRow[];
  siteUrl?: string;
}): Metadata {
  const siteUrl = input.siteUrl ?? getCanonicalPublicSiteUrl();
  const spaceId = input.space.id;

  if (!isSpacePubliclyVisible(input.space)) {
    return buildPrivateSpaceMetadata(spaceId, siteUrl);
  }

  const title = input.space.title?.trim() || PRIVATE_SPACE_SHARE_TITLE;
  const description = formatPublicSpaceShareDescription(title);
  const pageUrl = `${siteUrl}/spaces/${spaceId}`;
  const imageUrl = resolvePublicSpaceShareImageUrl({
    spaceId,
    coverImageId: input.space.coverImageId,
    imageUrls: input.imageUrls,
    images: input.images,
    siteUrl,
  });

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: "website",
      siteName: "FindMySpace",
      images: [{ url: imageUrl, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}
