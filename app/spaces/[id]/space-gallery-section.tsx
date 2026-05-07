"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Heart, Images } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SpaceGallerySection({
  spaceId,
  title,
  imageUrls,
}: {
  spaceId: string;
  title: string;
  imageUrls: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFavourite, setIsFavourite] = useState(false);
  const [favouriteBusy, setFavouriteBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }

      if (event.key === "ArrowLeft") {
        setSelectedIndex((prev) =>
          prev === 0 ? imageUrls.length - 1 : prev - 1
        );
      }

      if (event.key === "ArrowRight") {
        setSelectedIndex((prev) =>
          prev === imageUrls.length - 1 ? 0 : prev + 1
        );
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, imageUrls.length]);

  useEffect(() => {
    let active = true;
    async function loadFavouriteState() {
      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;
      const uid = userData.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setIsFavourite(false);
        return;
      }

      const favouriteResult = await supabase
        .from("user_favourites" as never)
        .select("id")
        .eq("user_id", uid)
        .eq("space_id", spaceId)
        .maybeSingle();

      if (!active) return;
      setIsFavourite(
        Boolean((favouriteResult as unknown as { data: { id: string } | null }).data)
      );
    }
    loadFavouriteState();
    return () => {
      active = false;
    };
  }, [spaceId]);

  async function toggleFavourite(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!userId) {
      router.push("/login");
      return;
    }
    setFavouriteBusy(true);
    if (isFavourite) {
      await supabase
        .from("user_favourites" as never)
        .delete()
        .eq("user_id", userId)
        .eq("space_id", spaceId);
      setIsFavourite(false);
    } else {
      await supabase
        .from("user_favourites" as never)
        .insert({ user_id: userId, space_id: spaceId } as never);
      setIsFavourite(true);
    }
    setFavouriteBusy(false);
  }

  if (!imageUrls || imageUrls.length === 0) {
    return (
      <div className="mb-6 rounded-md border border-gray-200 bg-gray-100 p-10 text-center text-sm text-gray-500">
        No images uploaded yet
      </div>
    );
  }

  const main = imageUrls[0];
  // Show at most 2 secondaries — every other photo lives behind "View all photos".
  const secondaries = imageUrls.slice(1, 3);
  const hasSecondaries = secondaries.length > 0;
  const onlyOneSecondary = secondaries.length === 1;
  const twoSecondaries = secondaries.length === 2;
  // How many photos are NOT shown in the preview tiles (main + secondaries).
  // Drives the "+N" badge on the desktop "View all photos" overlay.
  const remainingHiddenCount = Math.max(
    0,
    imageUrls.length - 1 - secondaries.length
  );

  const openAtIndex = (index: number) => {
    setSelectedIndex(index);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
  };

  const showPrevious = () => {
    setSelectedIndex((prev) =>
      prev === 0 ? imageUrls.length - 1 : prev - 1
    );
  };

  const showNext = () => {
    setSelectedIndex((prev) =>
      prev === imageUrls.length - 1 ? 0 : prev + 1
    );
  };

  return (
    <>
      <div className="mb-6">
        <div
          className={`grid gap-2 ${
            hasSecondaries
              ? "md:h-[340px] md:grid-cols-[2fr_1fr] md:grid-rows-2"
              : ""
          }`}
        >
          {/* Main image — full width on mobile, spans both rows on desktop. */}
          <div
            className={`relative h-[280px] sm:h-[320px] md:h-auto ${
              hasSecondaries ? "md:row-span-2" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => openAtIndex(0)}
              aria-label={`View ${title} photo 1`}
              className={`absolute inset-0 overflow-hidden text-left ${
                hasSecondaries
                  ? "rounded-2xl md:rounded-r-none"
                  : "rounded-2xl"
              }`}
            >
              <Image
                src={main}
                alt={title}
                fill
                className="object-cover"
                priority
              />
            </button>

            {/* Favourite heart — top-right of the main image, never clashes
                with the desktop "View all photos" overlay (which sits on the
                second secondary, bottom-right of the right column). */}
            <button
              type="button"
              onClick={toggleFavourite}
              disabled={favouriteBusy}
              aria-label={
                isFavourite ? "Remove from favourites" : "Save to favourites"
              }
              className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#334155] shadow-[0_8px_18px_rgba(15,23,42,0.18)] transition hover:bg-white disabled:opacity-70"
            >
              <Heart
                className={`h-4.5 w-4.5 ${
                  isFavourite
                    ? "fill-[#c1121f] text-[#c1121f]"
                    : "text-[#334155]"
                }`}
              />
            </button>

            {/* Mobile-only "View all photos" pill — bottom-right of the main
                image. Hidden on desktop because the secondary tiles take
                over there. */}
            {imageUrls.length > 1 && (
              <button
                type="button"
                onClick={() => openAtIndex(0)}
                className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#0f172a] shadow-[0_8px_18px_rgba(15,23,42,0.18)] backdrop-blur-sm transition hover:bg-white md:hidden"
                aria-label={`View all ${imageUrls.length} photos`}
              >
                <Images className="h-3.5 w-3.5" aria-hidden />
                View all {imageUrls.length} photos
              </button>
            )}
          </div>

          {/* Secondary 1 — desktop only. If it's the only secondary it
              spans both rows; otherwise just the top row. */}
          {hasSecondaries && (
            <div
              className={`relative hidden md:block ${
                onlyOneSecondary ? "md:row-span-2" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => openAtIndex(1)}
                aria-label={`View ${title} photo 2`}
                className={`absolute inset-0 overflow-hidden text-left ${
                  onlyOneSecondary ? "md:rounded-r-2xl" : "md:rounded-tr-2xl"
                }`}
              >
                <Image
                  src={secondaries[0]}
                  alt={`${title} 2`}
                  fill
                  className="object-cover"
                />
              </button>

              {/* If only one secondary tile exists (2 photos total),
                  the "View all photos" overlay sits here. */}
              {onlyOneSecondary && imageUrls.length > 1 && (
                <ViewAllPhotosButton
                  onClick={() => openAtIndex(0)}
                  count={remainingHiddenCount}
                />
              )}
            </div>
          )}

          {/* Secondary 2 — desktop only. Always carries the "View all
              photos" overlay (with optional +N badge). */}
          {twoSecondaries && (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => openAtIndex(2)}
                aria-label={`View ${title} photo 3`}
                className="absolute inset-0 overflow-hidden text-left md:rounded-br-2xl"
              >
                <Image
                  src={secondaries[1]}
                  alt={`${title} 3`}
                  fill
                  className="object-cover"
                />
              </button>

              <ViewAllPhotosButton
                onClick={() => openAtIndex(0)}
                count={remainingHiddenCount}
              />
            </div>
          )}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/90"
          onClick={closeModal}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeModal();
            }}
            className="absolute right-4 top-4 z-[110] flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-2xl font-semibold text-white shadow-lg ring-1 ring-white/20 hover:bg-black/85"
            aria-label="Close photo gallery"
          >
            ×
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              showPrevious();
            }}
            className="absolute left-4 top-1/2 z-[110] -translate-y-1/2 rounded-full bg-black/70 px-3 py-2 text-3xl text-white shadow-lg ring-1 ring-white/20 hover:bg-black/85"
            aria-label="Previous photo"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              showNext();
            }}
            className="absolute right-4 top-1/2 z-[110] -translate-y-1/2 rounded-full bg-black/70 px-3 py-2 text-3xl text-white shadow-lg ring-1 ring-white/20 hover:bg-black/85"
            aria-label="Next photo"
          >
            ›
          </button>

          <div
            className="flex h-full items-center justify-center p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-[80vh] w-full max-w-6xl">
              <Image
                src={imageUrls[selectedIndex]}
                alt={`${title} ${selectedIndex + 1}`}
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white">
            {selectedIndex + 1} / {imageUrls.length}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Compact overlay pill that opens the full-screen photo modal.
 *
 * Layout matches the spec example: optional "+N" badge stacked above
 * a "View all photos" row with a subtle icon, sitting in the
 * bottom-right of whichever tile renders it.
 */
function ViewAllPhotosButton({
  onClick,
  count,
}: {
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        count > 0
          ? `View all photos, ${count} more`
          : "View all photos"
      }
      className="absolute bottom-3 right-3 z-20 inline-flex flex-col items-end rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-[#0f172a] shadow-[0_8px_18px_rgba(15,23,42,0.18)] backdrop-blur-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f172a]/20"
    >
      {count > 0 ? (
        <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-[#64748b]">
          +{count}
        </span>
      ) : null}
      <span
        className={`inline-flex items-center gap-1.5 ${count > 0 ? "mt-0.5" : ""}`}
      >
        <Images className="h-3.5 w-3.5" aria-hidden />
        View all photos
      </span>
    </button>
  );
}