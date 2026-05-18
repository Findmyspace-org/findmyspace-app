"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck, UserCheck } from "lucide-react";
import type { SpaceIntentKey } from "@/lib/space-intents";
import HomeLaunchModal from "@/app/components/HomeLaunchModal";
import HomeCategoryCard from "@/app/components/HomeCategoryCard";

const VIEW_ALL_KEY = "__all__";

type HomeIntentValue = SpaceIntentKey | typeof VIEW_ALL_KEY;

const HOME_CATEGORY_CARDS: {
  value: HomeIntentValue;
  title: string;
  description: string;
  image: string;
}[] = [
  {
    value: VIEW_ALL_KEY,
    title: "View all spaces",
    description: "Discover every type of space available.",
    image: "/images/categories/browse.png",
  },
  {
    value: "store",
    title: "Store something",
    description: "Storage, garages & practical space.",
    image: "/images/categories/store.png",
  },
  {
    value: "park",
    title: "Park something",
    description: "Secure parking for cars & trailers.",
    image: "/images/categories/park.png",
  },
  {
    value: "work",
    title: "Work somewhere",
    description: "Offices, desks & focused workspaces.",
    image: "/images/categories/work.png",
  },
  {
    value: "do",
    title: "Do something",
    description: "Sports, studios & activity spaces.",
    image: "/images/categories/do.png",
  },
  {
    value: "host",
    title: "Host something",
    description: "Event, dining & gathering spaces.",
    image: "/images/categories/host.png",
  },
];

const BROWSE_SPACES_HREF = "/spaces#browse-search";
const LIST_SPACE_HREF = "/list-your-space";

const heroBackgroundImage = "/images/homepage-hero.png";
const heroBackgroundImageMobile = "/images/homepage-hero-mobile.png";

export default function HomePage() {
  const router = useRouter();

  const [intent, setIntent] = useState<HomeIntentValue>(VIEW_ALL_KEY);
  const [trustStripEntered, setTrustStripEntered] = useState(false);

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

  function goToBrowse(nextIntent: HomeIntentValue) {
    const params = new URLSearchParams();
    if (nextIntent !== VIEW_ALL_KEY) {
      params.set("intent", nextIntent);
    }
    const queryString = params.toString();
    router.push(queryString ? `/spaces?${queryString}` : "/spaces");
  }

  /** Same rules as the category cards: “All” navigates immediately; intent toggles selection then navigates on repeat tap. */
  function handleHomeIntentSelect(nextIntent: HomeIntentValue) {
    if (nextIntent === VIEW_ALL_KEY) {
      setIntent(VIEW_ALL_KEY);
      goToBrowse(VIEW_ALL_KEY);
      return;
    }
    if (intent === nextIntent) {
      goToBrowse(nextIntent);
      return;
    }
    setIntent(nextIntent);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    goToBrowse(intent);
  }

  return (
    <>
      <HomeLaunchModal />
      <div className="pb-10 text-[#192a3a] sm:pb-12">
      <section className="relative flex w-full flex-col overflow-hidden max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:min-h-0 md:block md:h-auto md:max-h-none md:min-h-0 md:overflow-visible lg:min-h-[640px] xl:min-h-[700px]">
        {/* Mobile-only hero: portrait storage / trust imagery */}
        <div
          className="absolute inset-0 bg-cover bg-[center_22%] md:hidden"
          style={{ backgroundImage: `url('${heroBackgroundImageMobile}')` }}
          aria-hidden
        />
        {/* Desktop / tablet hero */}
        <div
          className="absolute inset-0 hidden bg-cover bg-center md:block"
          style={{ backgroundImage: `url('${heroBackgroundImage}')` }}
          aria-hidden
        />
        {/* Mobile: light scrims for headline legibility */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0c1d2f]/65 via-[#0c1d2f]/15 to-[#0c1d2f]/40 md:hidden"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent md:hidden"
          aria-hidden
        />
        {/* Desktop: subtle left scrim for headline legibility only */}
        <div
          className="absolute inset-0 hidden bg-gradient-to-r from-white/50 via-white/18 to-transparent sm:from-white/45 sm:via-white/14 md:block"
          aria-hidden
        />

        <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 max-md:justify-between max-md:gap-3 max-md:overflow-y-auto max-md:overscroll-y-contain max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-10 sm:px-6 md:block md:flex-none md:justify-start md:gap-6 md:overflow-visible md:px-6 md:pb-20 md:pt-9 lg:grid lg:grid-cols-[1fr_minmax(0,42rem)] lg:items-start lg:justify-between lg:gap-10 lg:pt-11 lg:pb-32 xl:grid-cols-[1fr_minmax(0,44rem)] xl:gap-12 xl:pb-36">
          {/* LEFT: editorial hero + CTAs (CTAs hidden on mobile — navbar + category panel carry actions) */}
          <div className="max-w-xl shrink-0 max-md:mx-auto max-md:w-full max-md:text-center lg:max-w-none lg:pt-1">
            <h1 className="max-w-3xl text-[1.65rem] font-semibold leading-[1.08] tracking-tight text-white max-md:mx-auto max-md:max-w-[20ch] md:text-[#0f172a] md:text-5xl md:leading-tight md:tracking-normal md:max-w-3xl lg:text-6xl">
              The right space
              <br />
              in the{" "}
              <span className="text-[#c1121f] drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)] md:drop-shadow-none">
                right place.
              </span>
            </h1>
            <p className="mx-auto mt-2 mb-0 max-w-md max-md:mb-0 md:mb-0 md:mt-4 md:mx-0 md:text-left lg:mt-5">
              <span className="inline-block max-w-full rounded-2xl border border-white/25 bg-[#0c1d2f]/45 px-2.5 py-1.5 text-[12px] leading-snug text-white/95 shadow-[0_8px_32px_rgba(12,29,47,0.35)] md:rounded-xl md:border-[#0f172a]/5 md:bg-[#0f172a]/10 md:px-3 md:py-1.5 md:text-sm md:leading-relaxed md:text-[#1f2937] md:shadow-none lg:text-base">
                Find trusted storage, parking, workspace and lifestyle spaces from local owners.
              </span>
            </p>
            <div className="mt-3 hidden md:mt-7 md:flex md:flex-row md:flex-wrap md:items-center md:gap-3.5">
              <button
                type="button"
                onClick={() => router.push(BROWSE_SPACES_HREF)}
                className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl bg-[#0c1d2f] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_18px_rgba(12,29,47,0.32),0_1px_2px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#0a1726] hover:shadow-[0_10px_28px_rgba(12,29,47,0.38),0_2px_6px_rgba(15,23,42,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0c1d2f] focus-visible:ring-offset-2 active:translate-y-0 active:shadow-[0_4px_18px_rgba(12,29,47,0.32),0_1px_2px_rgba(15,23,42,0.08)] motion-reduce:transform-none motion-reduce:transition-colors sm:w-auto sm:px-6 sm:py-3"
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

          {/* RIGHT: category selector + CTA */}
          <div className="mt-auto w-full shrink-0 max-md:mt-0 md:mt-7 lg:mt-0 lg:max-w-[42rem] lg:justify-self-end lg:-translate-y-1 xl:max-w-[44rem] xl:-translate-y-2">
            <div className="rounded-2xl border border-white/55 bg-white/92 p-2.5 shadow-[0_20px_50px_rgba(15,23,42,0.14),0_2px_12px_rgba(15,23,42,0.07)] max-md:shadow-[0_24px_56px_rgba(12,29,47,0.22)] md:rounded-3xl md:border-[#e5e7eb] md:bg-white md:p-5 md:shadow-[0_24px_60px_rgba(15,23,42,0.13),0_2px_8px_rgba(15,23,42,0.05)] lg:p-6">
              <div className="mb-2 md:mb-5">
                <p className="text-sm font-semibold text-[#0f172a] md:text-lg">
                  What do you need space for?
                </p>
                <p className="mt-0.5 line-clamp-1 text-[10px] leading-snug text-[#64748b] md:mt-1 md:line-clamp-none md:text-xs md:leading-relaxed md:text-sm">
                  Tell us what you want to do and we&apos;ll show you matching listings.
                </p>
              </div>

              <form onSubmit={handleSearch} className="space-y-2 md:space-y-5">
                <div
                  id="home-space-type"
                  role="radiogroup"
                  aria-label="What do you need space for?"
                  className="grid grid-cols-2 gap-1.5 md:gap-3"
                >
                  {HOME_CATEGORY_CARDS.map((card) => {
                    const selected =
                      card.value === VIEW_ALL_KEY
                        ? intent === VIEW_ALL_KEY
                        : intent === card.value;
                    return (
                      <HomeCategoryCard
                        key={card.value === VIEW_ALL_KEY ? "all" : card.value}
                        title={card.title}
                        description={card.description}
                        imageSrc={card.image}
                        selected={selected}
                        onClick={() => handleHomeIntentSelect(card.value)}
                      />
                    );
                  })}
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[46px] shrink-0 rounded-xl bg-[#c1121f] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_18px_rgba(193,18,31,0.35)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#a70f19] hover:shadow-[0_12px_28px_rgba(193,18,31,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2 active:translate-y-0 active:shadow-[0_4px_16px_rgba(193,18,31,0.32)] motion-reduce:transform-none motion-reduce:transition-colors md:min-h-[54px] md:px-5 md:py-3.5"
                  aria-label="Find matching spaces"
                >
                  Find matching spaces
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Trust row: below the fold on mobile; overlaps hero from md+ (unchanged) */}
      <div className="pointer-events-none relative z-20 max-md:mt-8 px-4 sm:px-6 md:-mt-14 md:mt-28 lg:-mt-20">
        <div className="mx-auto max-w-4xl">
          <div
            className={`pointer-events-auto rounded-2xl border border-white/70 bg-white/95 p-3 shadow-[0_20px_50px_rgba(15,23,42,0.12),0_2px_12px_rgba(15,23,42,0.06)] backdrop-blur-md transition-[opacity,transform,box-shadow] duration-[520ms] ease-out sm:rounded-3xl sm:p-5 ${
              trustStripEntered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
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
    </>
  );
}
