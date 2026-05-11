"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Car,
  CheckCircle2,
  CircleEllipsis,
  Home,
  LayoutGrid,
  MapPin,
  Package,
  PartyPopper,
  ShieldCheck,
  Sparkles,
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

type HomeIntentValue = SpaceIntentKey | typeof VIEW_ALL_KEY;

/** Desktop / tablet grid order (unchanged). */
const ORDERED_HOME_INTENT_KEYS: SpaceIntentKey[] = ["store", "park", "work", "do", "host"];

/** Mobile chip order (icon + short label); keys still map to `intent` / `SPACE_INTENTS`. */
const MOBILE_INTENT_CHIP_ORDER: SpaceIntentKey[] = ["store", "park", "host", "work", "do"];

type HomeIcon = React.ComponentType<{ className?: string }>;

const MOBILE_INTENT_CHIP_ICON: Record<SpaceIntentKey, HomeIcon> = {
  store: Package,
  park: Car,
  host: Home,
  work: Briefcase,
  do: Sparkles,
};

const MOBILE_INTENT_CHIP_LABEL: Record<SpaceIntentKey, string> = {
  store: "Store",
  park: "Park",
  host: "Host",
  work: "Work",
  do: "Do",
};

const HOME_MOBILE_INTENT_CHIPS: { value: HomeIntentValue; label: string; Icon: HomeIcon }[] = [
  { value: VIEW_ALL_KEY, label: "View All", Icon: LayoutGrid },
  ...MOBILE_INTENT_CHIP_ORDER.map((key) => ({
    value: key,
    label: MOBILE_INTENT_CHIP_LABEL[key],
    Icon: MOBILE_INTENT_CHIP_ICON[key],
  })),
];

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

  const [intent, setIntent] = useState<HomeIntentValue>(VIEW_ALL_KEY);
  const [browseQuery, setBrowseQuery] = useState("");
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
    const q = browseQuery.trim();
    if (q) params.set("q", q);
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

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-4 pb-10 sm:px-6 md:pt-9 md:pb-20 lg:grid lg:grid-cols-[1fr_minmax(0,34rem)] lg:items-start lg:justify-between lg:gap-10 lg:pt-11 lg:pb-32 xl:grid-cols-[1fr_minmax(0,35.5rem)] xl:gap-12 xl:pb-36">
          {/* LEFT: editorial hero + CTAs */}
          <div className="max-w-xl lg:max-w-none lg:pt-1">
            <h1 className="max-w-3xl text-3xl font-semibold leading-[1.12] text-[#0f172a] md:text-5xl md:leading-tight lg:text-6xl">
              The right space
              <br />
              in the <span className="text-[#c1121f]">right place.</span>
            </h1>
            <p className="mt-1.5 max-w-md md:mt-4 md:max-w-lg lg:mt-5">
              <span className="inline-block max-w-full rounded-xl border border-[#0f172a]/5 bg-[#0f172a]/10 px-2.5 py-1.5 text-[13px] leading-snug text-[#1f2937] backdrop-blur-sm md:px-3 md:py-1.5 md:text-sm md:leading-relaxed lg:text-base">
                Find trusted storage, parking, workspace and lifestyle spaces from local owners.
              </span>
            </p>
            <div className="mt-3 flex flex-col gap-2.5 md:mt-7 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3.5">
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

          {/* RIGHT: floating marketplace card — narrower, lighter rhythm */}
          <div className="mt-3 w-full md:mt-7 lg:mt-0 lg:max-w-[34rem] lg:justify-self-end lg:-translate-y-1 xl:max-w-[35.5rem] xl:-translate-y-2">
            <div className="rounded-3xl border border-white/55 bg-white/72 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.13),0_2px_8px_rgba(15,23,42,0.05)] backdrop-blur-xl md:border-[#e5e7eb] md:bg-white md:p-4 md:shadow-[0_24px_60px_rgba(15,23,42,0.13),0_2px_8px_rgba(15,23,42,0.05)] md:backdrop-blur-none lg:p-5">
              <div className="mb-2 hidden md:mb-2.5 md:block">
                <p className="text-[0.8125rem] font-semibold text-[#1e293b] sm:text-sm">Find a space</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#64748b] md:text-xs md:leading-snug">
                  Tell us what you want to do and we&apos;ll show you matching listings.
                </p>
              </div>

              <form onSubmit={handleSearch} className="space-y-2 md:space-y-3.5">
                <div>
                  <label
                    className="mb-1 hidden text-xs font-medium leading-5 text-[#475569] md:mb-1.5 md:block"
                    htmlFor="home-space-type"
                  >
                    What type of space are you looking for?
                  </label>
                  <div
                    id="home-space-type"
                    role="radiogroup"
                    aria-label="What type of space are you looking for?"
                  >
                    {/* Mobile: compact horizontal chips with icons (< md) */}
                    <div className="md:hidden -mx-0.5">
                      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 pt-0.5 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                        {HOME_MOBILE_INTENT_CHIPS.map(({ value, label, Icon }) => {
                          const selected =
                            value === VIEW_ALL_KEY ? intent === VIEW_ALL_KEY : intent === value;
                          return (
                            <button
                              key={value === VIEW_ALL_KEY ? "all" : value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => handleHomeIntentSelect(value)}
                              className={`flex shrink-0 select-none items-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] font-semibold tracking-tight transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/35 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-colors motion-reduce:active:scale-100 ${
                                selected
                                  ? "border-[#c1121f]/90 bg-[#c1121f] text-white shadow-[0_4px_16px_rgba(193,18,31,0.38),0_0_0_1px_rgba(255,255,255,0.06)_inset] hover:bg-[#b0101c]"
                                  : "border border-white/60 bg-white/45 text-[#0f172a] shadow-[0_2px_10px_rgba(15,23,42,0.06)] backdrop-blur-md hover:border-white/85 hover:bg-white/60 hover:shadow-[0_4px_14px_rgba(15,23,42,0.08)]"
                              }`}
                            >
                              <Icon
                                className={`h-3.5 w-3.5 shrink-0 transition-colors duration-200 ${
                                  selected ? "text-white" : "text-[#334155]"
                                }`}
                                aria-hidden
                              />
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="hidden grid-cols-2 gap-2.5 md:grid">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={intent === VIEW_ALL_KEY}
                      onClick={() => handleHomeIntentSelect(VIEW_ALL_KEY)}
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
                    {ORDERED_HOME_INTENT_KEYS.map((intentKey) => {
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
                          onClick={() => handleHomeIntentSelect(option.key)}
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

                  <div className="mt-1.5 md:hidden">
                    <label htmlFor="home-browse-q" className="sr-only">
                      Location, suburb, city, or keyword (optional)
                    </label>
                    <div className="relative">
                      <MapPin
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]"
                        aria-hidden
                      />
                      <input
                        id="home-browse-q"
                        type="search"
                        value={browseQuery}
                        onChange={(e) => setBrowseQuery(e.target.value)}
                        placeholder="Location, suburb, city, or keyword"
                        autoCapitalize="words"
                        enterKeyHint="search"
                        className="w-full rounded-xl border border-white/55 bg-white/40 py-2.5 pl-10 pr-3 text-sm text-[#0f172a] shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none backdrop-blur-md transition-[border,box-shadow,background-color] duration-200 placeholder:text-[#64748b] focus:border-[#c1121f]/35 focus:bg-white/55 focus:ring-2 focus:ring-[#c1121f]/20"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[46px] rounded-xl bg-[#c1121f] py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(193,18,31,0.32)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#a70f19] hover:shadow-[0_10px_24px_rgba(193,18,31,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2 active:translate-y-0 active:shadow-[0_4px_16px_rgba(193,18,31,0.32)] motion-reduce:transform-none motion-reduce:transition-colors md:text-[0.9375rem]"
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
