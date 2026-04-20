"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Opens the booking bottom sheet when returning from auth (?book=1), then strips the param.
 */
export default function BookingSheetBootstrap() {
  const searchParams = useSearchParams();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    if (searchParams.get("book") !== "1") return;

    doneRef.current = true;
    const el = document.getElementById(
      "space-booking-toggle"
    ) as HTMLInputElement | null;
    if (el) {
      el.checked = true;
    }

    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("book")) return;
    url.searchParams.delete("book");
    const next =
      url.pathname +
      (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") +
      url.hash;
    window.history.replaceState({}, "", next);
  }, [searchParams]);

  return null;
}
