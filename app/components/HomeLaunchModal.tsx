"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

const SESSION_STORAGE_KEY = "fms_home_launch_modal_dismissed";
const LIST_SPACE_HREF = "/list-your-space";

export default function HomeLaunchModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        if (sessionStorage.getItem(SESSION_STORAGE_KEY) === "1") return;
      } catch {
        /* ignore quota / private mode */
      }
      setOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismiss]);

  function handleListSpace() {
    dismiss();
    router.push(LIST_SPACE_HREF);
  }

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex min-h-[100dvh] items-center justify-center p-4 sm:p-6"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-[#0c1d2f]/70 backdrop-blur-[2px]"
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-launch-modal-title"
        aria-describedby="home-launch-modal-desc"
        className="relative z-10 w-full max-w-[min(100%,24rem)] rounded-2xl border border-white/20 bg-white p-6 shadow-[0_24px_64px_rgba(12,29,47,0.28),0_2px_12px_rgba(15,23,42,0.08)] sm:max-w-md sm:rounded-3xl sm:p-8"
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-[#64748b] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/35 focus-visible:ring-offset-2 sm:right-4 sm:top-4"
          aria-label="Close announcement"
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        <div className="pr-10 sm:pr-8">
          <p
            id="home-launch-modal-title"
            className="text-lg font-semibold leading-tight tracking-tight text-[#0c1d2f] sm:text-xl"
          >
            Launching 1 July 2026
          </p>
          <p className="mt-2 text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-[#c1121f] sm:text-sm sm:tracking-[0.2em]">
            Be part of the SPACE RACE
          </p>
          <p
            id="home-launch-modal-desc"
            className="mt-4 text-sm leading-relaxed text-[#475569] sm:text-[0.9375rem]"
          >
            List your space and become one of the first FindMySpace owners.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:mt-9">
          <button
            type="button"
            onClick={handleListSpace}
            className="w-full min-h-[48px] rounded-xl bg-[#c1121f] px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_4px_18px_rgba(193,18,31,0.35)] transition-all duration-200 hover:bg-[#a70f19] hover:shadow-[0_8px_24px_rgba(193,18,31,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2 active:translate-y-px"
          >
            List your space
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-lg py-2 text-center text-sm font-medium text-[#475569] underline decoration-[#cbd5e1] underline-offset-4 transition-colors hover:text-[#0c1d2f] hover:decoration-[#94a3b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0c1d2f]/20 focus-visible:ring-offset-2"
          >
            Continue to site
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
