import Image from "next/image";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarDays,
  Car,
  CheckCircle2,
  Compass,
  Dumbbell,
  Search,
  Send,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import V2FeaturedSpaces from "@/app/components/v2/V2FeaturedSpaces";
import { V2Container } from "@/app/components/v2/V2Primitives";
import type { SpaceIntentKey } from "@/lib/space-intents";
import {
  buildV2Href,
  V2_BROWSE_HREF,
  V2_BROWSE_PATH,
} from "@/lib/v2/ui-version";

const QUICK_TYPES: Array<{
  label: string;
  intent: SpaceIntentKey;
  icon: LucideIcon;
}> = [
  { label: "Events", intent: "host", icon: CalendarDays },
  { label: "Work & meetings", intent: "work", icon: BriefcaseBusiness },
  { label: "Parking", intent: "park", icon: Car },
  { label: "Sports & activities", intent: "do", icon: Dumbbell },
  { label: "Storage", intent: "store", icon: Warehouse },
];

const HOW_IT_WORKS = [
  {
    title: "Find",
    copy: "Search by place or choose what you need the space for.",
    icon: Search,
  },
  {
    title: "Request",
    copy: "Choose your dates and send the host your booking request.",
    icon: Send,
  },
  {
    title: "Book",
    copy: "Complete payment after approval and your space is secured.",
    icon: CheckCircle2,
  },
] as const;

export default function V2HomePage() {
  return (
    <>
      <V2Container>
        <section className="fms-v2-home-hero" aria-labelledby="v2-home-title">
          <div className="fms-v2-home-hero-copy">
            <h1 id="v2-home-title">
              The right space in the right place.
            </h1>
            <p className="fms-v2-home-intro">
              Venues, parking, meeting spaces and unique places around you.
            </p>

            <form
              action={V2_BROWSE_PATH}
              method="get"
              className="fms-v2-home-search"
              role="search"
            >
              <label htmlFor="v2-location-search" className="fms-v2-sr-only">
                Where are you looking?
              </label>
              <input type="hidden" name="ui" value="v2" />
              <Search aria-hidden />
              <input
                id="v2-location-search"
                name="q"
                type="search"
                placeholder="Where are you looking?"
                autoComplete="off"
              />
              <button type="submit">Search</button>
            </form>

            <div
              className="fms-v2-quick-types"
              aria-label="Browse by space type"
            >
              {QUICK_TYPES.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.intent}
                    href={buildV2Href(V2_BROWSE_PATH, {
                      intent: item.intent,
                    })}
                    className="fms-v2-quick-type"
                  >
                    <Icon aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="fms-v2-home-hero-image" aria-hidden>
            <Image
              src="/images/homepage-hero.png"
              alt=""
              fill
              priority
              sizes="(max-width: 767px) 100vw, 48vw"
              className="object-cover"
            />
          </div>
        </section>

        <V2FeaturedSpaces />

        <section
          className="fms-v2-home-section"
          aria-labelledby="discovery-heading"
        >
          <div className="fms-v2-section-heading">
            <div>
              <p className="fms-v2-eyebrow">Explore differently</p>
              <h2 id="discovery-heading">Start with an idea</h2>
            </div>
          </div>

          <div className="fms-v2-editorial-grid">
            <Link
              href={buildV2Href(V2_BROWSE_PATH, { q: "Paarl" })}
              className="fms-v2-editorial-card"
            >
              <Image
                src="/images/categories/host.png"
                alt=""
                fill
                sizes="(max-width: 767px) 100vw, 50vw"
                className="object-cover"
              />
              <span>
                <small>Explore by place</small>
                Spaces in Paarl
              </span>
            </Link>

            <Link
              href={buildV2Href(V2_BROWSE_PATH, { intent: "work" })}
              className="fms-v2-editorial-card"
            >
              <Image
                src="/images/categories/work.png"
                alt=""
                fill
                sizes="(max-width: 767px) 100vw, 50vw"
                className="object-cover"
              />
              <span>
                <small>Work somewhere</small>
                Places to meet and focus
              </span>
            </Link>
          </div>
        </section>

        <section
          className="fms-v2-home-section fms-v2-how"
          aria-labelledby="how-heading"
        >
          <div className="fms-v2-section-heading">
            <div>
              <p className="fms-v2-eyebrow">How it works</p>
              <h2 id="how-heading">From search to space</h2>
            </div>
          </div>

          <ol>
            {HOW_IT_WORKS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title}>
                  <span className="fms-v2-how-number">0{index + 1}</span>
                  <Icon aria-hidden />
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <Link href={V2_BROWSE_HREF} className="fms-v2-discovery-link">
            <Compass aria-hidden />
            Browse all spaces
          </Link>
        </section>
      </V2Container>
    </>
  );
}
