"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  getOwnerListingClaimHref,
  NEEDS_CHANGES_STATUS,
} from "@/lib/listing-lifecycle";
import { ownerApiFetch } from "@/lib/owner-api-client";
import type { ListingCompletionResult } from "@/lib/listing-completion";

/**
 * Legacy route — preserves claim-accept and notification links.
 * Routes claim onboarding to `/claim`; needs_changes goes to listing edit.
 */
export default function ListingCompleteRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const spaceId = typeof params.id === "string" ? params.id : "";
  const [error, setError] = useState("");

  useEffect(() => {
    async function route() {
      if (!spaceId) return;
      try {
        const data = await ownerApiFetch(
          `/api/owner/listings/${spaceId}/completion-status`
        );
        const status = (data as ListingCompletionResult).status;
        if (status === NEEDS_CHANGES_STATUS) {
          router.replace(`/spaces/${spaceId}/edit`);
          return;
        }
        router.replace(getOwnerListingClaimHref(spaceId));
      } catch {
        setError("Could not open checklist.");
        router.replace(getOwnerListingClaimHref(spaceId));
      }
    }
    void route();
  }, [spaceId, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fafb] p-6">
      <p className="flex items-center gap-2 text-gray-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        {error || "Opening claim checklist…"}
      </p>
    </main>
  );
}
