"use client";

import { adminCanonicalSpaceEditHref } from "@/lib/admin-listing-routing";
import Link from "next/link";
import { useState } from "react";
import { Check, Copy, ExternalLink, Eye, Link2, Pencil, Upload } from "lucide-react";

type VenueScoutNextActionsProps = {
  spaceId: string;
  title: string;
  status: string;
  hasPhotos: boolean;
  claimPanelId?: string;
};

export function VenueScoutNextActions({
  spaceId,
  title,
  status,
  hasPhotos,
  claimPanelId = "scout-claim-panel",
}: VenueScoutNextActionsProps) {
  const [copied, setCopied] = useState(false);
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/spaces/${spaceId}`
      : `/spaces/${spaceId}`;

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const draftPreviewHref = `/admin/unclaimed-listings/${spaceId}/preview`;
  const publicHref = `/spaces/${spaceId}`;
  const fullEditHref = adminCanonicalSpaceEditHref(spaceId, {
    returnTo: "/admin/venue-scout",
  });

  return (
    <section className="rounded-xl border border-[#0f2740]/20 bg-[#f0f4f8] p-5">
      <h2 className="text-lg font-semibold text-[#0f2740]">Next steps</h2>
      <p className="mt-1 text-sm text-gray-600">
        Capture done for <span className="font-medium">{title || "this space"}</span>.
        Enrich or publish when ready.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {!hasPhotos ? (
          <li>
            <a
              href="#scout-photos"
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <Upload className="h-4 w-4 text-[#0f2740]" />
              Upload photos
            </a>
          </li>
        ) : null}
        <li>
          <Link
            href={draftPreviewHref}
            target="_blank"
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <Eye className="h-4 w-4 text-[#0f2740]" />
            Preview draft
          </Link>
        </li>
        {status === "unclaimed" ? (
          <li>
            <Link
              href={publicHref}
              target="_blank"
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4 text-[#0f2740]" />
              Preview public listing
            </Link>
          </li>
        ) : null}
        <li>
          <a
            href={`#${claimPanelId}`}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <Link2 className="h-4 w-4 text-[#0f2740]" />
            Generate claim link
          </a>
        </li>
        {status === "unclaimed" ? (
          <li>
            <button
              type="button"
              onClick={() => void copyPublicLink()}
              className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-700" />
              ) : (
                <Copy className="h-4 w-4 text-[#0f2740]" />
              )}
              {copied ? "Copied" : "Copy public link"}
            </button>
          </li>
        ) : null}
        <li>
          <Link
            href={fullEditHref}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4 text-[#0f2740]" />
            Continue editing full listing
          </Link>
        </li>
      </ul>
    </section>
  );
}
