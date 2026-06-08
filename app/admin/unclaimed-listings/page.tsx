"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Building2,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminApiFetch } from "@/lib/admin-api-client";

type ListingRow = {
  id: string;
  title: string | null;
  city: string | null;
  suburb: string | null;
  space_type: string | null;
  status: string | null;
  created_at: string;
  enquiry_count: number;
};

function statusBadge(status: string | null) {
  if (status === "unclaimed") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-gray-100 text-gray-700";
}

export default function AdminUnclaimedListingsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApiFetch("/api/admin/spaces/unclaimed");
      setListings((result.listings as ListingRow[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load listings.");
      setListings([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const r = (profile as { role?: string } | null)?.role ?? null;
      setRole(r);
      if (r === "admin") {
        await load();
      } else {
        setLoading(false);
      }
    }
    void init();
  }, [load]);

  if (loading) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (role !== "admin") {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/unclaimed-listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Unclaimed listings
          </Link>
          <Link
            href="/admin/listing-enquiries"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Inbox className="h-4 w-4" />
            Listing enquiries
          </Link>
          <Link
            href="/admin/spaces"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Building2 className="h-4 w-4" />
            Spaces
          </Link>
          <Link
            href="/admin/listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ClipboardList className="h-4 w-4" />
            Listings
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Verification
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Unclaimed listings</h1>
            <p className="mt-1 text-sm text-gray-600">
              Admin-created spaces visible publicly without an owner. Pricing is hidden
              until verified.
            </p>
          </div>
          <Link
            href="/admin/unclaimed-listings/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New unclaimed listing
          </Link>
        </div>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {listings.length === 0 ? (
          <p className="mt-10 text-gray-500">No draft or unclaimed listings yet.</p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Enquiries</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {listings.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.title || "Untitled"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {[row.suburb, row.city].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(row.status)}`}
                      >
                        {row.status === "unclaimed" ? "Unclaimed" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.enquiry_count}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {format(new Date(row.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/unclaimed-listings/${row.id}/edit`}
                        className="font-medium text-[#0f2740] hover:underline"
                      >
                        Edit
                      </Link>
                      {row.status === "unclaimed" ? (
                        <>
                          {" · "}
                          <Link
                            href={`/spaces/${row.id}`}
                            className="text-gray-600 hover:underline"
                            target="_blank"
                          >
                            View public
                          </Link>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
