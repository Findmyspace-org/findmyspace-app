"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CarFront,
  Package,
  Building2,
  Warehouse,
  Briefcase,
} from "lucide-react";

/* ================= DATA ================= */

const SPACE_TYPES = [
  { label: "Any space", value: "all" },
  { label: "Storage", value: "storage" },
  { label: "Parking", value: "parking" },
  { label: "Office", value: "office" },
  { label: "Garage", value: "garage" },
  { label: "Workspace", value: "workspace" },
  { label: "Other", value: "other" },
];

const CATEGORY_CHIPS = [
  { label: "Parking", value: "parking", icon: CarFront },
  { label: "Storage", value: "storage", icon: Package },
  { label: "Office", value: "office", icon: Building2 },
  { label: "Garage", value: "garage", icon: Warehouse },
  { label: "Workspace", value: "workspace", icon: Briefcase },
];

/** After login/signup, land on create listing (AuthForm reads `next` query). */
const LIST_SPACE_LOGIN_HREF = `/login?next=${encodeURIComponent("/dashboard/new-space")}`;
const BROWSE_SPACES_HREF = "/spaces#browse-search";

/* ================= PAGE ================= */

export default function HomePage() {
  const router = useRouter();

  const [spaceType, setSpaceType] = useState("all");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const params = new URLSearchParams();

    if (spaceType !== "all") params.set("type", spaceType);

    const queryString = params.toString();
    router.push(queryString ? `/spaces?${queryString}` : "/spaces");
  }

  return (
    <main className="min-h-screen text-[#192a3a]">
      {/* HERO */}
      <section className="relative min-h-[700px] overflow-hidden">
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

            {/* CATEGORY CHIPS */}
            <div className="mt-8 flex flex-wrap gap-3">
              {CATEGORY_CHIPS.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setSpaceType(item.value)}
                    className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition ${
                      spaceType === item.value
                        ? "border-[#192a3a] bg-[#192a3a] text-white"
                        : "border-white/50 bg-white/40 backdrop-blur-md hover:bg-white/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SEARCH CARD */}
          <div className="rounded-md border border-white/40 bg-white/30 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <h2 className="mb-2 text-2xl font-semibold">Start your search</h2>

            <p className="mb-6 text-sm text-gray-600">
              Choose the kind of space you need.
            </p>

            <form onSubmit={handleSearch} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="home-space-type">
                  What type of space are you looking for?
                </label>

                <select
                  id="home-space-type"
                  value={spaceType}
                  onChange={(e) => setSpaceType(e.target.value)}
                  className="w-full rounded-md border border-white/50 bg-white/70 px-4 py-3 text-sm backdrop-blur-md"
                >
                  {SPACE_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full rounded-md bg-[#192a3a] py-3 text-white shadow-lg hover:opacity-95"
              >
                Search spaces
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* LOWER CARDS */}
      <section className="relative z-20 mx-auto -mt-6 max-w-7xl px-6 pb-12 sm:-mt-16 lg:-mt-32">
        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href={LIST_SPACE_LOGIN_HREF}
            className="block rounded-md border border-white/30 bg-white/20 p-6 text-center text-inherit no-underline shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#192a3a]"
          >
            <h3 className="mb-2 text-xl font-semibold">
              List unused space
            </h3>
            <p className="text-sm text-gray-700">
              Turn available space into income.
            </p>
          </Link>

          <Link
            href={BROWSE_SPACES_HREF}
            className="block rounded-md border border-white/30 bg-white/20 p-6 text-center text-inherit no-underline shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#192a3a]"
          >
            <h3 className="mb-2 text-xl font-semibold">
              Search by area
            </h3>
            <p className="text-sm text-gray-700">
              Find spaces near you quickly.
            </p>
          </Link>

          <Link
            href={BROWSE_SPACES_HREF}
            className="block rounded-md border border-white/30 bg-white/20 p-6 text-center text-inherit no-underline shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#192a3a]"
          >
            <h3 className="mb-2 text-xl font-semibold">
              Book the right fit
            </h3>
            <p className="text-sm text-gray-700">
              Compare and request easily.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}