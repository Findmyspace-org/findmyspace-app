"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminApiFetch } from "@/lib/admin-api-client";
import { AdminUnclaimedSpaceForm } from "@/app/components/AdminUnclaimedSpaceForm";
import { AdminListingClaimPanel } from "@/app/components/AdminListingClaimPanel";
import { UnclaimedListingEnquirySocialProof } from "@/app/components/UnclaimedListingEnquirySocialProof";
import { sortSpaceImages } from "@/lib/sort-space-images";
import type { SpaceCrmLinkSummary } from "@/lib/space-crm-link";

type SpaceRow = {
  id: string;
  title: string | null;
  description: string | null;
  space_type: string | null;
  booking_unit: string | null;
  city: string | null;
  suburb: string | null;
  street_address: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
};

export default function EditUnclaimedListingPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [space, setSpace] = useState<SpaceRow | null>(null);
  const [attributes, setAttributes] = useState<Record<string, string[]>>({});
  const [images, setImages] = useState<
    { id: string; image_url: string; sort_order: number | null }[]
  >([]);
  const [enquiryCount, setEnquiryCount] = useState(0);
  const [claimInterestCount, setClaimInterestCount] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [crmLink, setCrmLink] = useState<SpaceCrmLinkSummary | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await adminApiFetch(`/api/admin/spaces/${id}/unclaimed`);
      setSpace(result.space as SpaceRow);
      setAttributes((result.attributes as Record<string, string[]>) || {});
      setImages(
        sortSpaceImages(
          (result.images as {
            id: string;
            image_url: string;
            sort_order: number | null;
          }[]) || []
        )
      );
      setEnquiryCount((result.enquiry_count as number) || 0);
      setClaimInterestCount((result.claim_interest_count as number) || 0);
      setReadOnly(Boolean(result.readOnly));
      setCrmLink((result.crm_link as SpaceCrmLinkSummary | null) ?? null);
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
    return <main className="p-8 text-gray-600">Loading…</main>;
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
        <Link href="/admin/unclaimed-listings" className="mt-4 inline-block text-sm underline">
          Back to list
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/unclaimed-listings"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to unclaimed listings
          </Link>
          {space.status === "draft" || space.status === "unclaimed" ? (
            <Link
              href={
                space.status === "unclaimed"
                  ? `/spaces/${space.id}`
                  : `/admin/unclaimed-listings/${space.id}/preview`
              }
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-[#0f2740] hover:bg-gray-50"
            >
              <Eye className="h-4 w-4" />
              Preview listing
            </Link>
          ) : null}
          {enquiryCount > 0 ? (
            <Link
              href="/admin/listing-enquiries"
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              {enquiryCount} {enquiryCount === 1 ? "enquiry" : "enquiries"}
            </Link>
          ) : null}
          {claimInterestCount > 0 ? (
            <Link
              href={`/admin/listing-claim-interests?listing=${space.id}`}
              className="text-sm font-medium text-violet-700 hover:underline"
            >
              {claimInterestCount}{" "}
              {claimInterestCount === 1 ? "claim interest" : "claim interests"}
            </Link>
          ) : null}
        </div>

        <h1 className="text-2xl font-semibold text-gray-900">Edit unclaimed listing</h1>
        <p className="mt-2 text-sm text-gray-600">
          Use Preview listing to see the public page. The owner can update details after
          claiming.
        </p>
        {enquiryCount > 0 ? (
          <div className="mt-4">
            <UnclaimedListingEnquirySocialProof count={enquiryCount} />
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          <AdminListingClaimPanel
            spaceId={space.id}
            listingTitle={space.title || "Untitled listing"}
            spaceStatus={space.status}
            disabled={readOnly}
          />

          <AdminUnclaimedSpaceForm
            key={space.id}
            mode="edit"
            spaceId={space.id}
            initialStatus={space.status}
            enquiryCount={enquiryCount}
            readOnly={readOnly}
            initialCrmLink={crmLink}
            onSavedAndExit={() =>
              router.push("/admin/unclaimed-listings?saved=1")
            }
            initialImages={images}
            initial={{
              title: space.title || "",
              description: space.description || "",
              spaceType: space.space_type || "storage",
              bookingUnit: space.booking_unit || "day",
              city: space.city || "",
              suburb: space.suburb || "",
              streetAddress: space.street_address || "",
              province: space.province || "",
              postalCode: space.postal_code || "",
              country: space.country || "South Africa",
              latitude: space.latitude,
              longitude: space.longitude,
              attributes,
            }}
          />
        </div>
      </div>
    </main>
  );
}
