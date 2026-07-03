import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import {
  FALLBACK_SHARE_IMAGE_PATH,
  FINDMYSPACE_LOGO_PATH,
  SPACE_OG_IMAGE_HEIGHT,
  SPACE_OG_IMAGE_WIDTH,
  SPACE_OG_TAGLINE,
  toAbsolutePublicUrl,
} from "@/lib/space-share-metadata";
import { getSpaceOgSource, isSpaceOgEligible } from "@/lib/space-og-source";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

const OG_CACHE_CONTROL =
  "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

async function fetchImageOk(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return false;
    const contentType = response.headers.get("content-type") || "";
    return contentType.startsWith("image/");
  } catch {
    return false;
  }
}

function redirectToFallback(siteUrl: string): NextResponse {
  const fallbackUrl = toAbsolutePublicUrl(FALLBACK_SHARE_IMAGE_PATH, siteUrl);
  return NextResponse.redirect(fallbackUrl, {
    status: 302,
    headers: {
      "Cache-Control": OG_CACHE_CONTROL,
    },
  });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ spaceId: string }> }
) {
  const { spaceId } = await context.params;
  const siteUrl = getCanonicalPublicSiteUrl();
  const source = await getSpaceOgSource(spaceId);

  if (!isSpaceOgEligible(source)) {
    return redirectToFallback(siteUrl);
  }

  const coverUrl = source?.coverImage?.image_url?.trim();
  if (!coverUrl) {
    return redirectToFallback(siteUrl);
  }

  const absoluteCoverUrl = toAbsolutePublicUrl(coverUrl, siteUrl);
  const logoUrl = toAbsolutePublicUrl(FINDMYSPACE_LOGO_PATH, siteUrl);

  const [coverOk, logoOk] = await Promise.all([
    fetchImageOk(absoluteCoverUrl),
    fetchImageOk(logoUrl),
  ]);

  if (!coverOk) {
    return redirectToFallback(siteUrl);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#0f172a",
        }}
      >
        <img
          src={absoluteCoverUrl}
          alt=""
          width={SPACE_OG_IMAGE_WIDTH}
          height={SPACE_OG_IMAGE_HEIGHT}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "44%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "0 48px 40px",
            background:
              "linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.9) 100%)",
          }}
        >
          {logoOk ? (
            <img
              src={logoUrl}
              alt="FindMySpace"
              width={220}
              height={70}
              style={{
                objectFit: "contain",
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.02em",
              }}
            >
              FindMySpace
            </div>
          )}
          <div
            style={{
              marginTop: 14,
              fontSize: 26,
              color: "rgba(255,255,255,0.92)",
              textAlign: "center",
            }}
          >
            {SPACE_OG_TAGLINE}
          </div>
        </div>
      </div>
    ),
    {
      width: SPACE_OG_IMAGE_WIDTH,
      height: SPACE_OG_IMAGE_HEIGHT,
      headers: {
        "Cache-Control": OG_CACHE_CONTROL,
      },
    }
  );
}
