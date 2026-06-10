"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminApiFetch } from "@/lib/admin-api-client";
import { sortSpaceImages } from "@/lib/sort-space-images";
import { AdminUnclaimedListingPreview } from "@/app/components/AdminUnclaimedListingPreview";

type SpaceRow = {
  id: string;
  title: string | null;
  description: string | null;
  space_type: string | null;
  city: string | null;
  suburb: string | null;
  street_address: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  status: string | null;
};

export default function AdminUnclaimedListingPreviewPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [space, setSpace] = useState<SpaceRow | null>(null);
  const [attributes, setAttributes] = useState<Record<string, string[]>>({});
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await adminApiFetch(`/api/admin/spaces/${id}/unclaimed`);
      const row = result.space as SpaceRow;
      setSpace(row);
      setAttributes((result.attributes as Record<string, string[]>) || {});
      const imgs = sortSpaceImages(
        (result.images as { id: string; image_url: string; sort_order: number | null }[]) ||
          []
      );
      setImageUrls(imgs.map((img) => img.image_url));
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load listing.");
      setSpace(null);
    }
    setLoading(false);
  }, [id]);

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
    return <main className="p-8 text-gray-600">Loading preview…</main>;
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  if (!space) {
    return (
      <main className="p-8">
        <p className="text-red-600">{message || "Listing not found."}</p>
        <Link
          href={`/admin/unclaimed-listings/${id}/edit`}
          className="mt-4 inline-block text-sm underline"
        >
          Back to edit
        </Link>
      </main>
    );
  }

  const isDraft = space.status === "draft";

  return (
    <main className="min-h-screen bg-[#f8fafb] px-6 py-8 text-[#192a3a]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/admin/unclaimed-listings/${id}/edit`}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to edit
          </Link>
          {space.status === "unclaimed" ? (
            <Link
              href={`/spaces/${space.id}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0f2740] hover:underline"
            >
              Open live public page
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <h1 className="mb-6 text-2xl font-semibold text-gray-900">Preview listing</h1>

        <AdminUnclaimedListingPreview
          listing={{
            id: space.id,
            title: space.title || "Untitled listing",
            description: space.description,
            space_type: space.space_type,
            city: space.city,
            suburb: space.suburb,
            street_address: space.street_address,
            province: space.province,
            postal_code: space.postal_code,
            country: space.country,
            image_urls: imageUrls,
            attributes,
            isDraftPreview: isDraft,
          }}
        />
      </div>
    </main>
  );
}
