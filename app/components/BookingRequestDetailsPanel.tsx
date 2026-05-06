"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  bookingRequestDetailsHasDisplayableContent,
  formatZarFromRand,
  getAccessFrequencyLabel,
  getItemTypeLabel,
  parseBookingRequestDetailData,
} from "@/lib/booking-intelligence";
import { X } from "lucide-react";

type Props = {
  /** Raw JSON from booking_request_details.data */
  data: Record<string, unknown> | null | undefined;
  /** Panel title override */
  title?: string;
};

function DetailSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e2e8f0] bg-[#fbfcfd] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">{heading}</h3>
      <div className="mt-2 text-sm text-[#192a3a]">{children}</div>
    </section>
  );
}

export default function BookingRequestDetailsPanel({
  data,
  title = "Booking request details",
}: Props) {
  const parsed = parseBookingRequestDetailData(data);
  const hasContent = bookingRequestDetailsHasDisplayableContent(data);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [imageErrorByUrl, setImageErrorByUrl] = useState<Record<string, boolean>>({});

  const closeLightbox = useCallback(() => setLightboxUrl(null), []);

  useEffect(() => {
    if (!lightboxUrl) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightboxUrl, closeLightbox]);

  function openImage(url: string) {
    setLightboxUrl(url);
  }

  function fallbackOpenTab(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const photos = Array.isArray(parsed.photo_urls) ? parsed.photo_urls.filter(Boolean) : [];
  const dims = parsed.dimensions_cm;
  const hasDims =
    dims &&
    [dims.length, dims.width, dims.height].some(
      (n) => typeof n === "number" && Number.isFinite(n) && n > 0
    );
  const vehicle = parsed.vehicle;
  const hasVehicle =
    vehicle &&
    ((vehicle.type && vehicle.type.trim()) || (vehicle.registration && vehicle.registration.trim()));

  return (
    <>
      <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-[#192a3a]">{title}</h2>
          <p className="text-[11px] text-gray-500">
            {/* TODO: AI assistant integration — summarize for host decision */}
            Structured information from the renter
          </p>
        </div>

        {!hasContent ? (
          <div className="rounded-xl border border-dashed border-[#e2e8f0] bg-[#f8fafb] px-4 py-8 text-center text-sm text-gray-600">
            No additional booking details were provided.
          </div>
        ) : (
          <div className="space-y-3">
            {(parsed.item_type && String(parsed.item_type).trim()) ||
            (parsed.item_type_other && String(parsed.item_type_other).trim()) ? (
              <DetailSection heading="What they want to store / park / use">
                {parsed.item_type ? (
                  <p>
                    <span className="font-medium">Item type:</span>{" "}
                    {getItemTypeLabel(parsed.item_type)}
                  </p>
                ) : null}
                {parsed.item_type_other && String(parsed.item_type_other).trim() ? (
                  <p className={parsed.item_type ? "mt-1" : ""}>
                    <span className="font-medium">Other details:</span>{" "}
                    <span className="whitespace-pre-wrap">{parsed.item_type_other}</span>
                  </p>
                ) : null}
              </DetailSection>
            ) : null}

            {hasDims ? (
              <DetailSection heading="Dimensions">
                <ul className="grid gap-1 sm:grid-cols-3">
                  {typeof dims!.length === "number" && dims!.length! > 0 ? (
                    <li>
                      <span className="text-gray-600">Length:</span>{" "}
                      <span className="font-medium tabular-nums">{dims!.length} cm</span>
                    </li>
                  ) : null}
                  {typeof dims!.width === "number" && dims!.width! > 0 ? (
                    <li>
                      <span className="text-gray-600">Width:</span>{" "}
                      <span className="font-medium tabular-nums">{dims!.width} cm</span>
                    </li>
                  ) : null}
                  {typeof dims!.height === "number" && dims!.height! > 0 ? (
                    <li>
                      <span className="text-gray-600">Height:</span>{" "}
                      <span className="font-medium tabular-nums">{dims!.height} cm</span>
                    </li>
                  ) : null}
                </ul>
                <p className="mt-2 text-xs text-gray-500">Unit: centimetres (cm)</p>
              </DetailSection>
            ) : null}

            {hasVehicle ? (
              <DetailSection heading="Vehicle details">
                {vehicle!.type && vehicle!.type.trim() ? (
                  <p>
                    <span className="font-medium">Type:</span> {vehicle!.type}
                  </p>
                ) : null}
                {vehicle!.registration && vehicle!.registration.trim() ? (
                  <p className={vehicle!.type && vehicle!.type.trim() ? "mt-1" : ""}>
                    <span className="font-medium">Registration:</span> {vehicle!.registration}
                  </p>
                ) : null}
              </DetailSection>
            ) : null}

            {photos.length > 0 ? (
              <DetailSection heading="Photos">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photos.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => openImage(url)}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-[#e2e8f0] bg-[#f1f5f9] shadow-sm outline-none ring-[#192a3a]/20 focus-visible:ring-2"
                    >
                      {imageErrorByUrl[url] ? (
                        <span className="flex h-full items-center justify-center p-2 text-center text-xs text-gray-500">
                          Tap to open
                        </span>
                      ) : (
                        <Image
                          src={url}
                          alt="Renter upload"
                          fill
                          className="object-cover transition group-hover:opacity-95"
                          sizes="(max-width: 640px) 50vw, 120px"
                          unoptimized
                          onError={() =>
                            setImageErrorByUrl((prev) => ({ ...prev, [url]: true }))
                          }
                        />
                      )}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">Tap a photo to enlarge.</p>
              </DetailSection>
            ) : null}

            {parsed.access_frequency && String(parsed.access_frequency).trim() ? (
              <DetailSection heading="Access frequency">
                <p>{getAccessFrequencyLabel(parsed.access_frequency)}</p>
              </DetailSection>
            ) : null}

            {typeof parsed.estimated_value_zar === "number" &&
            Number.isFinite(parsed.estimated_value_zar) &&
            parsed.estimated_value_zar > 0 ? (
              <DetailSection heading="Estimated value">
                <p className="text-base font-semibold tabular-nums text-[#192a3a]">
                  {formatZarFromRand(parsed.estimated_value_zar)}{" "}
                  <span className="text-sm font-normal text-gray-600">(ZAR)</span>
                </p>
              </DetailSection>
            ) : null}

            {parsed.notes && String(parsed.notes).trim() ? (
              <DetailSection heading="Notes">
                <p className="whitespace-pre-wrap leading-relaxed">{parsed.notes}</p>
              </DetailSection>
            ) : null}
          </div>
        )}
      </div>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
          role="presentation"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <div
            className="relative max-h-[90vh] max-w-[min(96vw,900px)]"
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged photo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative max-h-[85vh] w-full min-h-[120px]">
              {imageErrorByUrl[lightboxUrl] ? (
                <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-6 text-[#192a3a]">
                  <p className="text-sm">Could not preview this image.</p>
                  <button
                    type="button"
                    onClick={() => fallbackOpenTab(lightboxUrl)}
                    className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm font-medium text-white"
                  >
                    Open in new tab
                  </button>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- external Supabase URLs, dynamic lightbox
                <img
                  src={lightboxUrl}
                  alt=""
                  className="max-h-[85vh] w-auto max-w-full rounded-lg object-contain"
                  onError={() =>
                    setImageErrorByUrl((prev) => ({ ...prev, [lightboxUrl]: true }))
                  }
                />
              )}
            </div>
            <p className="mt-2 text-center text-xs text-white/80">
              Click outside or press Esc to close ·{" "}
              <button
                type="button"
                className="underline"
                onClick={() => fallbackOpenTab(lightboxUrl)}
              >
                Open in new tab
              </button>
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
