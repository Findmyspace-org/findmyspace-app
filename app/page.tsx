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

const heroBackgroundImage = "/images/homepage-hero.png";

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
    <div className="pb-10 text-[#192a3a] sm:pb-12">
      <section className="relative min-h-0 w-full overflow-visible lg:min-h-[640px] xl:min-h-[700px]">
        {/* Photo: more visible than heavy white wash; readability from left-weighted scrim */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${heroBackgroundImage}')` }}
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-white/78 via-white/38 to-white/14 sm:from-white/72 sm:via-white/32 sm:to-white/10"
          aria-hidden
        />
        <div className="absolute inset-0 bg-black/[0.07] sm:bg-black/[0.05]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-7 pb-16 sm:px-6 sm:pt-9 sm:pb-20 lg:grid lg:grid-cols-[1fr_minmax(0,34rem)] lg:items-start lg:justify-between lg:gap-10 lg:pt-11 lg:pb-32 xl:grid-cols-[1fr_minmax(0,35.5rem)] xl:gap-12 xl:pb-36">
          {/* LEFT: editorial hero + CTAs */}
          <div className="max-w-xl lg:max-w-none lg:pt-1">
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-[#0f172a] sm:text-5xl lg:text-6xl">
              The right space
              <br />
              in the <span className="text-[#c1121f]">right place.</span>
            </h1>
            <p className="mt-3 max-w-md sm:mt-4 sm:max-w-lg lg:mt-5">
              <span className="inline-block rounded-xl border border-[#0f172a]/5 bg-[#0f172a]/10 px-3 py-1.5 text-sm leading-relaxed text-[#1f2937] backdrop-blur-sm sm:text-[0.9375rem] lg:text-base">
                Find trusted storage, parking, workspace and lifestyle spaces from local owners.
              </span>
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3.5">
              <button
                type="button"
                onClick={() => router.push(BROWSE_SPACES_HREF)}
                className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl bg-[#c1121f] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_18px_rgba(193,18,31,0.38),0_1px_2px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#a70f19] hover:shadow-[0_10px_28px_rgba(193,18,31,0.44),0_2px_6px_rgba(15,23,42,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2 active:translate-y-0 active:shadow-[0_4px_18px_rgba(193,18,31,0.38),0_1px_2px_rgba(15,23,42,0.08)] motion-reduce:transform-none motion-reduce:transition-colors sm:w-auto sm:px-6 sm:py-3"
                aria-label="Find a space"
              >
                Find a space
              </button>
              <button
                type="button"
                onClick={() => router.push(LIST_SPACE_HREF)}
                className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl border-2 border-white/90 bg-white/95 px-5 py-2.5 text-sm font-semibold text-[#0f172a] shadow-[0_8px_28px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#0f172a]/15 hover:bg-white hover:shadow-[0_14px_36px_rgba(15,23,42,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/35 focus-visible:ring-offset-2 active:translate-y-0 active:shadow-[0_8px_28px_rgba(15,23,42,0.12)] motion-reduce:transform-none motion-reduce:transition-colors sm:w-auto sm:px-6 sm:py-3"
                aria-label="List your space"
              >
                List your space
              </button>
            </div>
          </div>

          {/* RIGHT: floating marketplace card — narrower, lighter rhythm */}
          <div className="mt-7 w-full lg:mt-0 lg:max-w-[34rem] lg:justify-self-end lg:-translate-y-1 xl:max-w-[35.5rem] xl:-translate-y-2">
            <div className="rounded-3xl border border-[#e5e7eb] bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.13),0_2px_8px_rgba(15,23,42,0.05)] sm:p-4 lg:p-5">
              <div className="mb-2.5 sm:mb-3">
                <p className="text-[0.8125rem] font-semibold text-[#1e293b] sm:text-sm">Find a space</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#64748b] sm:text-xs sm:leading-snug">
                  Tell us what you want to do and we&apos;ll show you matching listings.
                </p>
              </div>

              <form onSubmit={handleSearch} className="space-y-3.5">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium leading-5 text-[#475569]"
                    htmlFor="home-space-type"
                  >
                    What type of space are you looking for?
                  </label>
                  <div
                    id="home-space-type"
                    className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-2.5"
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
                      className={`group w-full cursor-pointer rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30 focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-colors sm:px-3 sm:py-3 ${
                        intent === VIEW_ALL_KEY
                          ? "border-[#c1121f] bg-[#fff5f5] text-[#0f172a] shadow-[0_6px_18px_rgba(193,18,31,0.16),0_1px_2px_rgba(15,23,42,0.08)] hover:shadow-[0_10px_24px_rgba(193,18,31,0.22),0_1px_2px_rgba(15,23,42,0.08)]"
                          : "border-[#e5e7eb] bg-white text-[#334155] hover:border-[#cbd5e1] hover:bg-[#fcfdfd] hover:shadow-[0_8px_20px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.04)]"
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
                          <span className="block text-[0.8125rem] font-semibold leading-[1.25] text-[#0f172a] sm:text-sm sm:whitespace-nowrap">
                            View all spaces
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-[1.35] text-[#64748b] sm:text-xs">
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
                          className={`group w-full cursor-pointer rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30 focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-colors sm:px-3 sm:py-3 ${
                            selected
                              ? "border-[#c1121f] bg-[#fff5f5] text-[#0f172a] shadow-[0_6px_18px_rgba(193,18,31,0.16),0_1px_2px_rgba(15,23,42,0.08)] hover:shadow-[0_10px_24px_rgba(193,18,31,0.22),0_1px_2px_rgba(15,23,42,0.08)]"
                              : "border-[#e5e7eb] bg-white text-[#334155] hover:border-[#cbd5e1] hover:bg-[#fcfdfd] hover:shadow-[0_8px_20px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.04)]"
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
                              <span className="block text-[0.8125rem] font-semibold leading-[1.25] text-[#0f172a] sm:text-sm sm:whitespace-nowrap">
                                {option.label}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-[1.35] text-[#64748b] sm:text-xs">
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
                  className="w-full min-h-[44px] rounded-xl bg-[#c1121f] py-2 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(193,18,31,0.32)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#a70f19] hover:shadow-[0_10px_24px_rgba(193,18,31,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2 active:translate-y-0 active:shadow-[0_4px_16px_rgba(193,18,31,0.32)] motion-reduce:transform-none motion-reduce:transition-colors sm:min-h-[46px] sm:py-2.5 sm:text-[0.9375rem]"
                  aria-label="Find matching spaces"
                >
                  Find matching spaces
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Trust row: vertical middle aligns with the hero image's bottom edge */}
      <div className="pointer-events-none relative z-20 -mt-14 px-4 sm:-mt-16 sm:px-6 lg:-mt-20">
        <div className="mx-auto max-w-4xl">
          <div
            className={`pointer-events-auto rounded-2xl border border-white/70 bg-white/95 p-3 shadow-[0_20px_50px_rgba(15,23,42,0.12),0_2px_12px_rgba(15,23,42,0.06)] backdrop-blur-md transition-[opacity,transform,box-shadow] duration-[520ms] ease-out sm:rounded-3xl sm:p-5 ${
                trustStripEntered
                  ? "translate-y-0 opacity-100"
                  : "translate-y-3 opacity-0"
              }`}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5">
                <div className="min-w-0 rounded-xl px-1 py-0.5 sm:py-1">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <span className="shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-1.5 text-[#c1121f] sm:p-2">
                      <UserCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-snug text-[#0f172a] sm:text-sm">Verified owners</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[#64748b] sm:text-xs">
                        Owners are reviewed before listings go live.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 rounded-xl px-1 py-0.5 sm:py-1">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <span className="shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-1.5 text-[#c1121f] sm:p-2">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-snug text-[#0f172a] sm:text-sm">Secure booking flow</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[#64748b] sm:text-xs">
                        Bookings and payments follow a controlled platform process.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 rounded-xl px-1 py-0.5 sm:col-span-2 sm:py-1 lg:col-span-1">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <span className="shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-1.5 text-[#c1121f] sm:p-2">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-snug text-[#0f172a] sm:text-sm">Approved listings</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[#64748b] sm:text-xs">
                        Spaces are checked before being made available.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
