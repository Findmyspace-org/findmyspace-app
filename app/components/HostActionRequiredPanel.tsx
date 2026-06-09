"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  computeHostActionCards,
  hostActionStatusPillClass,
  type HostActionCard,
  type HostActionInput,
} from "@/lib/host-action-required";
import { fetchHostActionInput } from "@/lib/fetch-host-action-input";
import { supabase } from "@/lib/supabase";

function ActionCardRow({ card }: { card: HostActionCard }) {
  return (
    <Link
      href={card.href}
      className="group flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-gray-900">{card.title}</p>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${hostActionStatusPillClass(card.status)}`}
          >
            {card.statusLabel}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-600">{card.description}</p>
      </div>
      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#0f2740] opacity-70 transition group-hover:opacity-100">
        Open
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Link>
  );
}

function ActionSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2].map((key) => (
        <div
          key={key}
          className="h-[72px] rounded-xl border border-gray-200 bg-gray-50"
        />
      ))}
    </div>
  );
}

export function HostActionRequiredPanel() {
  const [input, setInput] = useState<HostActionInput | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent && !hasDataRef.current) {
      setInitialLoad(true);
    } else if (silent && hasDataRef.current) {
      setRefreshing(true);
    }
    if (!silent) setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (mountedRef.current) {
          setInput(null);
          setInitialLoad(false);
          setRefreshing(false);
        }
        return;
      }

      const next = await fetchHostActionInput(supabase, user.id);
      if (!mountedRef.current) return;

      if (!next) {
        if (!silent) setError("Could not load action items.");
      } else {
        setInput(next);
        hasDataRef.current = true;
      }
    } catch {
      if (mountedRef.current && !silent) {
        setError("Could not load action items.");
      }
    } finally {
      if (mountedRef.current) {
        setInitialLoad(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load(false);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void load(true);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const cards = input ? computeHostActionCards(input) : [];

  if (initialLoad && !input) {
    return (
      <section
        aria-labelledby="host-action-required"
        className="mb-6 rounded-xl border border-gray-200 bg-[#f8fafc] p-5 shadow-sm"
      >
        <h2
          id="host-action-required"
          className="text-lg font-semibold text-gray-900"
        >
          Action required
        </h2>
        <div className="mt-4">
          <ActionSkeleton />
        </div>
      </section>
    );
  }

  if (cards.length === 0) {
    return error ? (
      <section className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        {error}
      </section>
    ) : null;
  }

  return (
    <section
      aria-labelledby="host-action-required"
      className="mb-6 rounded-xl border border-gray-200 bg-[#f8fafc] p-5 shadow-sm"
    >
      <div className="mb-4">
        <h2 id="host-action-required" className="text-lg font-semibold text-gray-900">
          Action required
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Verification and listing steps that need your attention.
        </p>
      </div>

      {error ? (
        <p className="mb-3 text-sm text-gray-600">{error}</p>
      ) : null}

      <div className="space-y-3">
        {cards.map((card) => (
          <ActionCardRow key={card.id} card={card} />
        ))}
      </div>

      {refreshing ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Updating…
        </p>
      ) : null}
    </section>
  );
}

/** @deprecated Use HostActionRequiredPanel — kept for existing imports. */
export default HostActionRequiredPanel;
