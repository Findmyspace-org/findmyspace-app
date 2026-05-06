"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Heart } from "lucide-react";
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
  const rest = imageUrls.slice(1, 5);

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
      <div className="relative mb-6 grid gap-2 md:grid-cols-[2fr_1fr]">
        <button
          type="button"
          onClick={toggleFavourite}
          disabled={favouriteBusy}
          aria-label={isFavourite ? "Remove from favourites" : "Save to favourites"}
          className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#334155] shadow-[0_8px_18px_rgba(15,23,42,0.18)] transition hover:bg-white disabled:opacity-70"
        >
          <Heart className={`h-4.5 w-4.5 ${isFavourite ? "fill-[#c1121f] text-[#c1121f]" : "text-[#334155]"}`} />
        </button>
        <button
          type="button"
          onClick={() => openAtIndex(0)}
          className="relative h-[340px] overflow-hidden rounded-md text-left"
        >
          <Image src={main} alt={title} fill className="object-cover" />
        </button>

        <div className="grid gap-2">
          {rest.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => openAtIndex(i + 1)}
              className="relative h-[167px] overflow-hidden rounded-md text-left"
            >
              <Image
                src={img}
                alt={`${title} ${i + 2}`}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>

        {imageUrls.length > 1 && (
          <button
            type="button"
            onClick={() => openAtIndex(0)}
            className="absolute bottom-3 right-3 rounded-md border bg-white px-3 py-1.5 text-sm shadow"
          >
            View all photos
          </button>
        )}
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