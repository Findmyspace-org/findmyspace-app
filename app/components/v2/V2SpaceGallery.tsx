"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useEffect, useState } from "react";
import { V2MapMarker } from "./V2Brand";

export default function V2SpaceGallery({
  title,
  imageUrls,
}: {
  title: string;
  imageUrls: string[];
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const open = selectedIndex !== null;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedIndex(null);
      if (event.key === "ArrowLeft") {
        setSelectedIndex((current) =>
          current === null
            ? null
            : current === 0
              ? imageUrls.length - 1
              : current - 1
        );
      }
      if (event.key === "ArrowRight") {
        setSelectedIndex((current) =>
          current === null
            ? null
            : current === imageUrls.length - 1
              ? 0
              : current + 1
        );
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [imageUrls.length, open]);

  if (imageUrls.length === 0) {
    return (
      <div className="fms-v2-detail-gallery-empty">
        <V2MapMarker size={72} />
        <p>Photos are being prepared.</p>
      </div>
    );
  }

  const visibleImages = imageUrls.slice(0, 3);

  function previous() {
    setSelectedIndex((current) =>
      current === null
        ? null
        : current === 0
          ? imageUrls.length - 1
          : current - 1
    );
  }

  function next() {
    setSelectedIndex((current) =>
      current === null
        ? null
        : current === imageUrls.length - 1
          ? 0
          : current + 1
    );
  }

  return (
    <>
      <section
        className={`fms-v2-detail-gallery ${
          visibleImages.length === 1 ? "fms-v2-detail-gallery-single" : ""
        }`}
        aria-label={`${title} photos`}
      >
        {visibleImages.map((imageUrl, index) => (
          <button
            key={`${imageUrl}-${index}`}
            type="button"
            onClick={() => setSelectedIndex(index)}
            className={index === 0 ? "fms-v2-detail-gallery-primary" : ""}
            aria-label={`Open ${title} photo ${index + 1}`}
          >
            <Image
              src={imageUrl}
              alt={index === 0 ? title : `${title}, photo ${index + 1}`}
              fill
              priority={index === 0}
              sizes={
                index === 0
                  ? "(max-width: 767px) 92vw, 65vw"
                  : "(max-width: 767px) 82vw, 30vw"
              }
              className="object-cover"
            />
            {index === visibleImages.length - 1 && imageUrls.length > 1 ? (
              <span className="fms-v2-detail-gallery-count">
                <Images aria-hidden />
                {imageUrls.length} photos
              </span>
            ) : null}
          </button>
        ))}
      </section>

      {selectedIndex !== null ? (
        <div
          className="fms-v2-gallery-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photo gallery`}
          onClick={() => setSelectedIndex(null)}
        >
          <button
            type="button"
            autoFocus
            className="fms-v2-gallery-close"
            onClick={() => setSelectedIndex(null)}
            aria-label="Close gallery"
          >
            <X aria-hidden />
          </button>

          {imageUrls.length > 1 ? (
            <>
              <button
                type="button"
                className="fms-v2-gallery-previous"
                onClick={(event) => {
                  event.stopPropagation();
                  previous();
                }}
                aria-label="Previous photo"
              >
                <ChevronLeft aria-hidden />
              </button>
              <button
                type="button"
                className="fms-v2-gallery-next"
                onClick={(event) => {
                  event.stopPropagation();
                  next();
                }}
                aria-label="Next photo"
              >
                <ChevronRight aria-hidden />
              </button>
            </>
          ) : null}

          <div
            className="fms-v2-gallery-modal-image"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={imageUrls[selectedIndex]}
              alt={`${title}, photo ${selectedIndex + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
          </div>
          <p>
            {selectedIndex + 1} / {imageUrls.length}
          </p>
        </div>
      ) : null}
    </>
  );
}
