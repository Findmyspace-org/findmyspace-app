#!/usr/bin/env node
/**
 * Space share metadata helper tests (no DB).
 * Run: node scripts/test-space-share-metadata.mjs
 */

import assert from "node:assert/strict";

const PRIVATE_SPACE_SHARE_TITLE = "FindMySpace";
const PRIVATE_SPACE_SHARE_DESCRIPTION =
  "Find your space in the right place.";
const FALLBACK_SHARE_IMAGE_PATH = "/images/findmyspace-share-card.jpg";

function formatPublicSpaceShareDescription(spaceTitle) {
  return `Book this space, ${spaceTitle}, on FindMySpace: The right space in the right place.`;
}

function toAbsolutePublicUrl(pathOrUrl, siteUrl = "https://findmyspace.co.za") {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return `${siteUrl}${FALLBACK_SHARE_IMAGE_PATH}`;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${siteUrl}${path}`;
}

function sortSpaceImages(images) {
  return [...images].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}

function buildSpaceOgImageUrl(spaceId, coverImageId, siteUrl = "https://findmyspace.co.za") {
  const base = `${siteUrl}/api/og/space/${spaceId}`;
  const version = coverImageId?.trim();
  if (version) return `${base}?v=${encodeURIComponent(version)}`;
  return base;
}

function resolvePublicSpaceShareImageUrl({
  spaceId,
  coverImageId,
  imageUrls,
  images,
  siteUrl = "https://findmyspace.co.za",
}) {
  let hasCover = false;
  let resolvedCoverId = coverImageId?.trim() || null;

  if (images?.length) {
    const sorted = sortSpaceImages(images);
    const cover = sorted[0];
    if (cover?.image_url?.trim()) {
      hasCover = true;
      resolvedCoverId = cover.id;
    }
  } else if (imageUrls?.some((url) => url?.trim())) {
    hasCover = true;
  }

  if (!hasCover) {
    return toAbsolutePublicUrl(FALLBACK_SHARE_IMAGE_PATH, siteUrl);
  }

  return buildSpaceOgImageUrl(spaceId, resolvedCoverId, siteUrl);
}

function isSpacePubliclyVisible(mode) {
  return mode === "live" || mode === "enquiry";
}

function isSpaceOgEligible(space) {
  if (!space) return false;
  if (space.status === "deleted") return false;
  return isSpacePubliclyVisible(space.public_listing_mode);
}

function buildPublicSpaceShareMetadata({ space, imageUrls, images, siteUrl }) {
  if (!isSpacePubliclyVisible(space.public_listing_mode)) {
    return {
      title: PRIVATE_SPACE_SHARE_TITLE,
      description: PRIVATE_SPACE_SHARE_DESCRIPTION,
      openGraph: {
        images: [{ url: toAbsolutePublicUrl(FALLBACK_SHARE_IMAGE_PATH, siteUrl) }],
      },
      twitter: {
        images: [toAbsolutePublicUrl(FALLBACK_SHARE_IMAGE_PATH, siteUrl)],
      },
    };
  }

  const title = space.title?.trim() || PRIVATE_SPACE_SHARE_TITLE;
  const description = formatPublicSpaceShareDescription(title);
  const imageUrl = resolvePublicSpaceShareImageUrl({
    spaceId: space.id,
    coverImageId: space.coverImageId,
    imageUrls,
    images,
    siteUrl,
  });

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/spaces/${space.id}`,
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

const siteUrl = "https://findmyspace.co.za";
const perdebergDescription = formatPublicSpaceShareDescription("Perdeberg");

// Public listing with cover image uses dynamic OG route
const withImage = buildPublicSpaceShareMetadata({
  space: {
    id: "abc",
    title: "Perdeberg",
    public_listing_mode: "live",
    coverImageId: "img-cover",
  },
  imageUrls: ["https://cdn.example.com/cover.jpg"],
  siteUrl,
});
assert.equal(withImage.title, "Perdeberg");
assert.equal(withImage.description, perdebergDescription);
assert.ok(withImage.description.includes("Perdeberg"));
assert.equal(
  withImage.openGraph.images[0].url,
  "https://findmyspace.co.za/api/og/space/abc?v=img-cover"
);
assert.equal(withImage.twitter.images[0], withImage.openGraph.images[0].url);

// No images — static branded fallback
const noImage = buildPublicSpaceShareMetadata({
  space: { id: "abc", title: "Perdeberg", public_listing_mode: "live" },
  imageUrls: [],
  siteUrl,
});
assert.equal(noImage.title, "Perdeberg");
assert.equal(noImage.description, perdebergDescription);
assert.equal(
  noImage.openGraph.images[0].url,
  `${siteUrl}${FALLBACK_SHARE_IMAGE_PATH}`
);

// sort_order cover id for OG version param
const ogFromImages = resolvePublicSpaceShareImageUrl({
  spaceId: "abc",
  images: [
    { id: "b", image_url: "https://cdn.example.com/second.jpg", sort_order: 2 },
    { id: "a", image_url: "https://cdn.example.com/first.jpg", sort_order: 1 },
  ],
  siteUrl,
});
assert.equal(ogFromImages, "https://findmyspace.co.za/api/og/space/abc?v=a");

// Private / hidden listing — generic metadata and fallback image only
const hidden = buildPublicSpaceShareMetadata({
  space: { id: "hidden", title: "Secret", public_listing_mode: "off" },
  imageUrls: ["https://cdn.example.com/should-not-use.jpg"],
  siteUrl,
});
assert.equal(hidden.title, PRIVATE_SPACE_SHARE_TITLE);
assert.equal(hidden.description, PRIVATE_SPACE_SHARE_DESCRIPTION);
assert.ok(!hidden.description.includes("Secret"));
assert.ok(hidden.openGraph.images[0].url.includes("findmyspace-share-card.jpg"));

// OG route eligibility
assert.equal(isSpaceOgEligible({ public_listing_mode: "live", status: "active" }), true);
assert.equal(isSpaceOgEligible({ public_listing_mode: "off", status: "active" }), false);
assert.equal(isSpaceOgEligible({ public_listing_mode: "live", status: "deleted" }), false);

// Absolute URL helper
assert.equal(
  toAbsolutePublicUrl("/images/foo.png", siteUrl),
  `${siteUrl}/images/foo.png`
);

console.log("test-space-share-metadata: all assertions passed");
