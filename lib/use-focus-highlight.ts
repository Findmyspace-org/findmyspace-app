"use client";

import { useEffect, useState } from "react";

type Options = {
  /** The id of the entity to focus (e.g. from `?focus=…`). Null/empty disables focus. */
  focusId: string | null | undefined;
  /** Becomes true once the page's data is loaded so the row is in the DOM. */
  ready: boolean;
  /** Element-id prefix so we can compute `${prefix}-${focusId}`. */
  prefix: string;
  /** Highlight duration in ms. Defaults to 4000. */
  durationMs?: number;
};

/**
 * After the page's data is ready, scroll the matching DOM element into view
 * and apply a temporary highlight. Returns the currently highlighted id (or
 * null) so the caller can apply visual styles to the matching row.
 *
 * Usage:
 *   const { highlightedId } = useFocusHighlight({
 *     focusId: searchParams.get("focus"),
 *     ready: !loading,
 *     prefix: "booking-card",
 *   });
 *
 *   <div id={`booking-card-${b.id}`}
 *        className={highlightedId === b.id ? "ring-2 ring-[#c1121f]/40 …" : ""}>
 */
export function useFocusHighlight({
  focusId,
  ready,
  prefix,
  durationMs = 4000,
}: Options) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId || !ready) return;

    let cancelled = false;
    const tryFocus = () => {
      if (cancelled) return;
      const el = document.getElementById(`${prefix}-${focusId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedId(focusId);
      }
    };

    // Run on the next paint (layout settled), then once more shortly after in
    // case the row mounted just after `ready` flipped (e.g. a tab change).
    const raf =
      typeof window !== "undefined"
        ? window.requestAnimationFrame(tryFocus)
        : 0;
    const retry = window.setTimeout(tryFocus, 250);
    const clear = window.setTimeout(() => {
      if (!cancelled) setHighlightedId(null);
    }, durationMs);

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(retry);
      window.clearTimeout(clear);
    };
  }, [focusId, ready, prefix, durationMs]);

  return { highlightedId };
}

/**
 * Standard highlight class string used across focus targets. Centralised so
 * future tweaks land in one place.
 */
export const FOCUS_HIGHLIGHT_CLASS =
  "ring-2 ring-[#c1121f]/40 ring-offset-2 ring-offset-white bg-[#fff5f5] transition-all duration-300";
