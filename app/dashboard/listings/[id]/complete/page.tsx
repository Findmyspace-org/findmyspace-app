"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";

const CHECKLIST: {
  title: string;
  href: string | ((spaceId: string) => string);
  description: string;
}[] = [
  {
    title: "Review listing details",
    href: (id) => `/spaces/${id}/edit`,
    description: "Check title, description, location, and photos.",
  },
  {
    title: "Add or update photos",
    href: (id) => `/spaces/${id}/edit`,
    description: "Ensure the gallery reflects the space accurately.",
  },
  {
    title: "Complete pricing",
    href: (id) => `/spaces/${id}/edit`,
    description: "Set hourly, daily, or monthly rates.",
  },
  {
    title: "Set availability",
    href: "/dashboard/calendar",
    description: "Block unavailable dates and confirm your calendar.",
  },
  {
    title: "Complete profile verification",
    href: "/dashboard/verification",
    description: "ID, bank details, and proof of bank account.",
  },
  {
    title: "Upload ownership proof",
    href: (id) => `/spaces/${id}/edit`,
    description: "Proof of right to list this specific space.",
  },
  {
    title: "Submit for review",
    href: "/dashboard/listings",
    description: "FindMySpace admin will review before the listing goes live.",
  },
];

export default function ListingCompletePage() {
  const params = useParams();
  const spaceId = typeof params.id === "string" ? params.id : "";
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    void supabase
      .from("spaces")
      .select("title, status, owner_id")
      .eq("id", spaceId)
      .maybeSingle()
      .then(({ data }) => {
        setTitle((data as { title?: string } | null)?.title ?? null);
      });
  }, [spaceId]);

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f8fafb] px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
              <div>
                <h1 className="text-xl font-semibold">Listing claimed</h1>
                <p className="mt-1 text-sm leading-relaxed">
                  You successfully claimed{" "}
                  <strong>{title || "this listing"}</strong>. It is not live or
                  bookable yet — complete the steps below, then submit for admin
                  approval.
                </p>
              </div>
            </div>
          </div>

          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Next steps</h2>
            <ul className="mt-4 space-y-4">
              {CHECKLIST.map((item) => {
                const href =
                  typeof item.href === "function" ? item.href(spaceId) : item.href;
                return (
                  <li key={item.title} className="flex gap-3">
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                    <div>
                      <Link
                        href={href}
                        className="font-medium text-[#0f2740] hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-0.5 text-sm text-gray-600">{item.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/spaces/${spaceId}/edit`}
              className="rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
            >
              Edit listing
            </Link>
            <Link
              href="/dashboard/listings"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800"
            >
              My listings
            </Link>
          </div>
        </div>
      </main>
    </RequireAuth>
  );
}
