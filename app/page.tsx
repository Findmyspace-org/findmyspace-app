"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
            <p className="mt-4 max-w-xl text-sm text-gray-600">
              Start below: pick the kind of space you need, then browse listings.
            </p>
          </div>

          {/* SEARCH CARD */}
          <div className="rounded-md border border-white/40 bg-white/30 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <h2 className="mb-2 text-2xl font-semibold">Find a space</h2>

            <p className="mb-6 text-sm text-gray-600">
              What type of space are you looking for? We&apos;ll take you to matching
              listings.
            </p>

            <form onSubmit={handleSearch} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="home-space-type">
                  Space type
                </label>

                <select
                  id="home-space-type"
                  value={spaceType}
                  onChange={(e) => setSpaceType(e.target.value)}
                  className="w-full min-h-[48px] rounded-md border border-white/50 bg-white/80 px-4 py-3 text-base text-[#192a3a] backdrop-blur-md"
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
                className="w-full min-h-[48px] rounded-md bg-[#192a3a] py-3.5 text-base font-semibold text-white shadow-lg hover:opacity-95"
              >
                Browse listings
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* LOWER CARDS */}
      <section className="relative z-20 mx-auto -mt-6 max-w-7xl px-6 pb-12 sm:-mt-16 lg:-mt-32">
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href={LIST_SPACE_LOGIN_HREF}
            className="block rounded-md border border-white/30 bg-white/20 p-6 text-center text-inherit no-underline shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#192a3a]"
          >
            <h3 className="mb-2 text-xl font-semibold">List your space</h3>
            <p className="text-sm text-gray-700">
              Sign in to create a listing — earn from unused parking, storage, or more.
            </p>
          </Link>

          <Link
            href={BROWSE_SPACES_HREF}
            className="block rounded-md border border-white/30 bg-white/20 p-6 text-center text-inherit no-underline shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#192a3a]"
          >
            <h3 className="mb-2 text-xl font-semibold">Browse all spaces</h3>
            <p className="text-sm text-gray-700">
              Explore listings and refine by area on the map or filters.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}