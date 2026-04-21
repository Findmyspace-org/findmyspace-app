"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Briefcase,
  Car,
  CircleEllipsis,
  LayoutGrid,
  PartyPopper,
  Package,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { SPACE_INTENTS, type SpaceIntentKey } from "@/lib/space-intents";
/* ================= DATA ================= */
const INTENT_ICONS: Record<SpaceIntentKey, React.ComponentType<{ className?: string }>> = {
  store: Package,
  park: Car,
  work: Briefcase,
  do: CircleEllipsis,
  host: PartyPopper,
};
const VIEW_ALL_KEY = "__all__";

const INTENT_SUPPORT_TEXT: Record<SpaceIntentKey, string> = {
  store: "Storage, garage and practical options",
  park: "Safe parking and vehicle-friendly spaces",
  work: "Offices, desks and focused work settings",
  do: "Studios and flexible spaces for activities",
  host: "Spaces suited for events and gatherings",
};

const BROWSE_SPACES_HREF = "/spaces#browse-search";

/* ================= PAGE ================= */

export default function HomePage() {
  const router = useRouter();

  const [intent, setIntent] = useState<SpaceIntentKey | typeof VIEW_ALL_KEY>(VIEW_ALL_KEY);
  const [trustStripEntered, setTrustStripEntered] = useState(false);
  const orderedIntentKeys: SpaceIntentKey[] = ["store", "park", "work", "do", "host"];

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setTrustStripEntered(true);
      return;
    }
    const id = window.setTimeout(() => setTrustStripEntered(true), 160);
    return () => window.clearTimeout(id);
  }, []);

  function goToBrowse(nextIntent: SpaceIntentKey | typeof VIEW_ALL_KEY) {
    const params = new URLSearchParams();
    if (nextIntent !== VIEW_ALL_KEY) {
      params.set("intent", nextIntent);
    }
    const queryString = params.toString();
    router.push(queryString ? `/spaces?${queryString}` : "/spaces");
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    goToBrowse(intent);
  }

  return (
    <main className="min-h-screen text-[#192a3a]">
      {/* HERO */}
      <section className="relative min-h-[700px] overflow-visible pb-24 sm:pb-28">
        {/* Background */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/landing-background.jpg')" }}
        />

        {/* Overlay (NON-clickable) */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(248,250,251,0.72),rgba(248,250,251,0.38))]" />

        {/* Content */}
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-6 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          
          {/* LEFT */}
          <div>
            <p className="mb-4 text-sm uppercase tracking-[0.18em] text-gray-600">
              FindMySpace
            </p>

            <h1 className="text-5xl font-semibold leading-tight md:text-6xl">
              Find the right space,
              <br />
              in the right place.
            </h1>

            <p className="mt-6 max-w-xl text-lg text-gray-700">
              Discover useful spaces to rent across South Africa.
            </p>
          </div>

          {/* SEARCH CARD */}
          <div className="rounded-md border border-white/40 bg-white/30 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <h2 className="mb-2 text-2xl font-semibold">Find a space</h2>

            <p className="mb-6 text-sm text-gray-600">
              Tell us what you want to do and we&apos;ll show you matching
              listings.
            </p>

            <form onSubmit={handleSearch} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="home-space-type">
                  What do you want to do?
                </label>

                <div
                  id="home-space-type"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Choose your intent"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={intent === VIEW_ALL_KEY}
                    onClick={() => {
                      setIntent(VIEW_ALL_KEY);
                      goToBrowse(VIEW_ALL_KEY);
                    }}
                    className={`group w-full cursor-pointer rounded-xl border px-3 py-3 text-left shadow-sm transition-all duration-200 ease-out active:translate-y-0 ${
                      intent === VIEW_ALL_KEY
                        ? "border-[#192a3a]/35 bg-white text-[#192a3a] ring-2 ring-[#192a3a]/10 hover:-translate-y-0.5 hover:shadow-md hover:border-[#192a3a]/45"
                        : "border-white/60 bg-white/75 text-gray-700 hover:-translate-y-0.5 hover:bg-white hover:border-gray-300 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`rounded-lg border p-1.5 ${
                          intent === VIEW_ALL_KEY
                            ? "border-[#192a3a]/20 bg-[#192a3a]/5 text-[#192a3a]"
                            : "border-gray-200 bg-white text-gray-500"
                        }`}
                      >
                        <LayoutGrid className="h-4 w-4 transition-all duration-200 ease-out group-hover:scale-[1.04] group-hover:text-[#192a3a]" />
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block text-sm font-semibold ${
                            intent === VIEW_ALL_KEY ? "text-[#192a3a]" : "text-gray-700"
                          }`}
                        >
                          View all spaces
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-600">
                          Browse all categories without pre-filtering
                        </span>
                      </span>
                    </div>
                  </button>
                  {orderedIntentKeys.map((intentKey) => {
                    const option = SPACE_INTENTS.find((item) => item.key === intentKey);
                    if (!option) return null;
                    const Icon = INTENT_ICONS[option.key];
                    const selected = intent === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          if (intent === option.key) {
                            goToBrowse(option.key);
                            return;
                          }
                          setIntent(option.key);
                        }}
                        className={`group w-full cursor-pointer rounded-xl border px-3 py-3 text-left shadow-sm transition-all duration-200 ease-out active:translate-y-0 ${
                          selected
                            ? "border-[#192a3a]/35 bg-white text-[#192a3a] ring-2 ring-[#192a3a]/10 hover:-translate-y-0.5 hover:shadow-md hover:border-[#192a3a]/45"
                            : "border-white/60 bg-white/75 text-gray-700 hover:-translate-y-0.5 hover:bg-white hover:border-gray-300 hover:shadow-md"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`rounded-lg border p-1.5 ${
                              selected
                                ? "border-[#192a3a]/20 bg-[#192a3a]/5 text-[#192a3a]"
                                : "border-gray-200 bg-white text-gray-500"
                            }`}
                          >
                            <Icon className="h-4 w-4 transition-all duration-200 ease-out group-hover:scale-[1.04] group-hover:text-[#192a3a]" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{option.label}</span>
                            <span className="mt-0.5 block text-xs text-gray-600">
                              {INTENT_SUPPORT_TEXT[option.key]}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] rounded-md bg-[#192a3a] py-3.5 text-base font-semibold text-white shadow-lg hover:opacity-95"
              >
                Show matching spaces
              </button>
            </form>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-[-20px] z-20 -mt-10 px-6 sm:bottom-[-36px]">
          <div className="relative mx-auto max-w-4xl">
            <div
              className="pointer-events-none absolute inset-x-0 -top-8 bottom-0 -z-10 rounded-2xl bg-gradient-to-t from-white/70 to-transparent"
              aria-hidden
            />
            <div
              className={`pointer-events-none cursor-default rounded-2xl border border-white/30 bg-white/55 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-md transition-[opacity,transform,filter,box-shadow] duration-[520ms] ease-out sm:p-5 ${
                trustStripEntered
                  ? "translate-y-0 opacity-100 blur-0 shadow-[0_8px_30px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]"
                  : "translate-y-3 opacity-0 blur-[1.5px] shadow-[0_4px_18px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.45)]"
              }`}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-4">
                <div className="min-w-0 cursor-default rounded-xl border border-transparent px-2.5 py-2.5 sm:px-3 sm:py-3">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <span className="shrink-0 rounded-lg border border-white/40 bg-white/40 p-2 text-red-500">
                      <BadgeCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-[#192a3a]">Verified listings</p>
                      <p className="mt-1 text-xs leading-snug text-gray-600">
                        Quality and trust you can rely on.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 cursor-default rounded-xl border border-transparent px-2.5 py-2.5 sm:px-3 sm:py-3">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <span className="shrink-0 rounded-lg border border-white/40 bg-white/40 p-2 text-red-500">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-[#192a3a]">Secure payments</p>
                      <p className="mt-1 text-xs leading-snug text-gray-600">
                        Safe, simple and protected.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 cursor-default rounded-xl border border-transparent px-2.5 py-2.5 sm:px-3 sm:py-3">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <span className="shrink-0 rounded-lg border border-white/40 bg-white/40 p-2 text-red-500">
                      <UserCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-[#192a3a]">Verified owners</p>
                      <p className="mt-1 text-xs leading-snug text-gray-600">
                        Trusted hosts with verified details.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}