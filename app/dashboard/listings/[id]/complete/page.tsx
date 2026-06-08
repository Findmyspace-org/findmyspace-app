"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  Send,
} from "lucide-react";
import RequireAuth from "@/app/components/RequireAuth";
import ListingCompletionChecklist from "@/app/components/ListingCompletionChecklist";
import type { ListingCompletionResult } from "@/lib/listing-completion";
import { ownerApiFetch } from "@/lib/owner-api-client";

function statusBanner(status: string | null) {
  switch (status) {
    case "pending_verification":
      return {
        className: "border-blue-200 bg-blue-50 text-blue-950",
        icon: Clock3,
        title: "Pending review",
        body: "Your listing has been submitted. FindMySpace will review your verification, ownership proof, and listing details before it goes live.",
      };
    case "needs_changes":
      return {
        className: "border-amber-200 bg-amber-50 text-amber-950",
        icon: AlertCircle,
        title: "Updates needed",
        body: "FindMySpace needs a few updates before your listing can go live.",
      };
    case "rejected":
      return {
        className: "border-red-200 bg-red-50 text-red-950",
        icon: AlertCircle,
        title: "Listing rejected",
        body: "This listing was not approved. Review the admin note below, update your listing, and resubmit when ready.",
      };
    case "active":
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-950",
        icon: CheckCircle2,
        title: "Listing live",
        body: "Your listing is now live and bookable on FindMySpace.",
      };
    default:
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-950",
        icon: CheckCircle2,
        title: "Listing claimed",
        body: "Complete the steps below, then submit for admin approval before your listing goes live.",
      };
  }
}

export default function ListingCompletePage() {
  const params = useParams();
  const spaceId = typeof params.id === "string" ? params.id : "";
  const [completion, setCompletion] = useState<ListingCompletionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const data = await ownerApiFetch(
        `/api/owner/listings/${spaceId}/completion-status`
      );
      setCompletion(data as ListingCompletionResult);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load checklist.");
      setCompletion(null);
    }
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    if (!spaceId || !completion?.canSubmit) return;
    setSubmitting(true);
    setMessage("");
    try {
      const result = await ownerApiFetch(
        `/api/owner/listings/${spaceId}/submit-review`,
        { method: "POST" }
      );
      setCompletion((result.completion as ListingCompletionResult) || completion);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Submit failed.");
    }
    setSubmitting(false);
  }

  const banner = statusBanner(completion?.status ?? null);
  const BannerIcon = banner.icon;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f8fafb] px-6 py-10">
        <div className="mx-auto max-w-2xl">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading checklist…
            </div>
          ) : completion ? (
            <>
              <div className={`rounded-2xl border p-5 ${banner.className}`}>
                <div className="flex items-start gap-3">
                  <BannerIcon className="mt-0.5 h-6 w-6 shrink-0" />
                  <div>
                    <h1 className="text-xl font-semibold">{banner.title}</h1>
                    <p className="mt-1 text-sm leading-relaxed">
                      {banner.body}
                      {completion.listingTitle ? (
                        <>
                          {" "}
                          <strong>{completion.listingTitle}</strong>
                        </>
                      ) : null}
                    </p>
                    {completion.listing_admin_comment &&
                    (completion.status === "needs_changes" ||
                      completion.status === "rejected") ? (
                      <div className="mt-3 rounded-lg border border-current/20 bg-white/60 p-3 text-sm">
                        <p className="font-semibold">Admin note</p>
                        <p className="mt-1 whitespace-pre-wrap">
                          {completion.listing_admin_comment}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Checklist</h2>
                <div className="mt-4">
                  <ListingCompletionChecklist items={completion.items} />
                </div>
              </section>

              {completion.submitBlockers.length > 0 &&
              (completion.status === "owner_claimed" ||
                completion.status === "needs_changes" ||
                completion.status === "rejected") ? (
                <p className="mt-4 text-sm text-gray-600">
                  Before you can submit: {completion.submitBlockers.join(", ")}.
                </p>
              ) : null}

              {message ? (
                <p className="mt-4 text-sm text-red-600">{message}</p>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-3">
                {completion.canSubmit ? (
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Submit for review
                  </button>
                ) : null}
                <Link
                  href={`/spaces/${spaceId}/edit`}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800"
                >
                  Edit listing
                </Link>
                <Link
                  href="/dashboard/listings"
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800"
                >
                  My listings
                </Link>
                {completion.status === "active" ? (
                  <Link
                    href={`/spaces/${spaceId}`}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900"
                  >
                    View live listing
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-red-600">{message || "Listing not found."}</p>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}
