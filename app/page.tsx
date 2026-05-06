"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Car,
  CheckCircle2,
  CircleEllipsis,
  LayoutGrid,
  Package,
  PartyPopper,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { SPACE_INTENTS, type SpaceIntentKey } from "@/lib/space-intents";

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
const LIST_SPACE_HREF = "/list-your-space";

/** Same hero asset and treatment as `app/spaces/page.tsx` (Browse Spaces). */
const heroBackgroundImage = "/images/findmyspace-hero.jpg";

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
    <div className="pb-12 text-[#192a3a]">
      {/* Premium hero — aligned with Browse Spaces (`app/spaces/page.tsx`) */}
      <section className="relative h-[300px] w-full overflow-hidden sm:h-[340px] lg:h-[400px]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${heroBackgroundImage}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/72 via-white/52 to-white/36" />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-center px-4 sm:px-6">
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-[#0f172a] sm:text-4xl lg:text-5xl xl:text-6xl">
            The right space
            <br />
            in the <span className="text-[#c1121f]">right place.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#1f2937] sm:mt-4 sm:text-lg">
            Find trusted storage, parking, workspace and lifestyle spaces from local owners.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={() => router.push(BROWSE_SPACES_HREF)}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#c1121f] px-6 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2 sm:w-auto"
              aria-label="Find a space"
            >
              Find a space
            </button>
            <button
              type="button"
              onClick={() => router.push(LIST_SPACE_HREF)}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#d7dde3] bg-white px-6 py-3 text-sm font-semibold text-[#334155] shadow-sm transition hover:border-[#b8c2cc] hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30 focus-visible:ring-offset-2 sm:w-auto"
              aria-label="List your space"
            >
              List your space
            </button>
          </div>
        </div>
      </section>

      {/* Elevated panel — same visual language as Browse search card */}
      <section className="relative z-20 mx-auto -mt-12 max-w-6xl px-4 sm:-mt-14 sm:px-6">
        <div className="rounded-3xl border border-[#e5e7eb] bg-white p-4 shadow-[0_28px_65px_rgba(15,23,42,0.12)] sm:p-6">
          <div className="mb-4">
            <p className="text-sm font-medium text-[#1e293b]">Find a space</p>
            <p className="mt-1 text-sm text-[#64748b]">
              Tell us what you want to do and we&apos;ll show you matching listings.
            </p>
          </div>

          <form onSubmit={handleSearch} className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-medium leading-5 text-[#475569]" htmlFor="home-space-type">
                What type of space are you looking for?
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
                  className={`group w-full cursor-pointer rounded-xl border px-3 py-3 text-left shadow-sm transition-all duration-200 ${
                    intent === VIEW_ALL_KEY
                      ? "border-[#c1121f] bg-[#fff5f5] text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                      : "border-[#e5e7eb] bg-white text-[#334155] hover:border-[#d4dbe2] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`rounded-lg border p-1.5 ${
                        intent === VIEW_ALL_KEY
                          ? "border-[#c1121f]/25 bg-white text-[#c1121f]"
                          : "border-[#e5e7eb] bg-[#f8fafc] text-[#64748b]"
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4 transition duration-200 group-hover:scale-[1.04]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#0f172a]">View all spaces</span>
                      <span className="mt-0.5 block text-xs leading-snug text-[#64748b]">
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
                      className={`group w-full cursor-pointer rounded-xl border px-3 py-3 text-left shadow-sm transition-all duration-200 ${
                        selected
                          ? "border-[#c1121f] bg-[#fff5f5] text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                          : "border-[#e5e7eb] bg-white text-[#334155] hover:border-[#d4dbe2] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`rounded-lg border p-1.5 ${
                            selected
                              ? "border-[#c1121f]/25 bg-white text-[#c1121f]"
                              : "border-[#e5e7eb] bg-[#f8fafc] text-[#64748b]"
                          }`}
                        >
                          <Icon className="h-4 w-4 transition duration-200 group-hover:scale-[1.04]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[#0f172a]">{option.label}</span>
                          <span className="mt-0.5 block text-xs leading-snug text-[#64748b]">
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
              className="w-full min-h-[48px] rounded-xl bg-[#c1121f] py-3 text-base font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2"
              aria-label="Find matching spaces"
            >
              Find matching spaces
            </button>
          </form>
        </div>

        {/* Trust row — compact premium card, same ecosystem as Browse */}
        <div className="pointer-events-none mt-6 sm:mt-8">
          <div className="relative mx-auto max-w-6xl">
            <div
              className={`pointer-events-auto rounded-3xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-[opacity,transform] duration-[520ms] ease-out sm:p-5 ${
                trustStripEntered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                <div className="min-w-0 rounded-xl px-1 py-1">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-2 text-[#c1121f]">
                      <UserCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-[#0f172a]">Verified owners</p>
                      <p className="mt-0.5 text-xs leading-snug text-[#64748b]">
                        Owners are reviewed before listings go live.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 rounded-xl px-1 py-1">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-2 text-[#c1121f]">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-[#0f172a]">Secure booking flow</p>
                      <p className="mt-0.5 text-xs leading-snug text-[#64748b]">
                        Bookings and payments follow a controlled platform process.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 rounded-xl px-1 py-1">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-2 text-[#c1121f]">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-[#0f172a]">Approved listings</p>
                      <p className="mt-0.5 text-xs leading-snug text-[#64748b]">
                        Spaces are checked before being made available.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
