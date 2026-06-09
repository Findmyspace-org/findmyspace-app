"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminApiFetch } from "@/lib/admin-api-client";
import { markNotificationsReadByRelatedClient } from "@/lib/mark-notifications-read-client";
import ListingCompletionChecklist from "@/app/components/ListingCompletionChecklist";
import type { ListingCompletionResult } from "@/lib/listing-completion";

type ReviewPayload = {
  completion: ListingCompletionResult;
  space: {
    id: string;
    title: string | null;
    city: string | null;
    suburb: string | null;
    status: string | null;
    listing_admin_comment: string | null;
    submitted_for_review_at: string | null;
  } | null;
  owner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    owner_verification_status: string | null;
    bank_verification_status: string | null;
  } | null;
  ownershipDoc: {
    file_url: string;
    status: string | null;
  } | null;
};

export default function AdminListingReviewDetailPage() {
  const params = useParams();
  const spaceId = typeof params.id === "string" ? params.id : "";
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const data = await adminApiFetch(
        `/api/admin/spaces/${spaceId}/completion-status`
      );
      setPayload(data as ReviewPayload);
      setComment(
        ((data as ReviewPayload).space?.listing_admin_comment as string) || ""
      );
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load review.");
      setPayload(null);
    }
    setLoading(false);
  }, [spaceId]);

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
        if (spaceId) {
          void markNotificationsReadByRelatedClient({
            relatedEntityType: "space",
            relatedEntityId: spaceId,
            types: ["listing_pending", "listing_submitted"],
          });
        }
      } else {
        setLoading(false);
      }
    }
    void init();
  }, [load]);

  async function runAction(
    action: "approve" | "request-changes" | "reject",
    path: string
  ) {
    setActing(action);
    setMessage("");
    try {
      const body =
        action === "approve" ? undefined : JSON.stringify({ comment: comment.trim() });
      await adminApiFetch(path, {
        method: "POST",
        ...(body ? { body } : {}),
      });
      await load();
      setMessage(
        action === "approve"
          ? "Listing approved and is now active."
          : action === "request-changes"
            ? "Owner notified to make updates."
            : "Listing rejected."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed.");
    }
    setActing(null);
  }

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

  if (!payload?.completion) {
    return (
      <main className="p-8">
        <p className="text-red-600">{message || "Listing not found."}</p>
      </main>
    );
  }

  const { completion, space, owner, ownershipDoc } = payload;
  const ownerName =
    `${owner?.first_name || ""} ${owner?.last_name || ""}`.trim() ||
    owner?.email ||
    "Owner";
  const canReview =
    space?.status === "pending_verification" || space?.status === "pending";

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/admin/listing-reviews"
          className="text-sm font-medium text-[#0f2740] hover:underline"
        >
          ← Back to listing reviews
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {space?.title || "Untitled listing"}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {ownerName}
              {owner?.email ? ` · ${owner.email}` : ""}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Status:{" "}
              <span className="font-medium">
                {(space?.status || "").replace(/_/g, " ")}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/spaces/${spaceId}`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" />
              Preview
            </Link>
            <Link
              href={`/admin/verification`}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Verification
            </Link>
          </div>
        </div>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Checklist summary</h2>
          <div className="mt-4">
            <ListingCompletionChecklist items={completion.items} linkItems={false} />
          </div>
          {completion.approvalBlockers.length > 0 ? (
            <p className="mt-4 text-sm text-amber-800">
              Cannot approve until: {completion.approvalBlockers.join(", ")}.
            </p>
          ) : canReview ? (
            <p className="mt-4 text-sm text-emerald-700">
              All approval requirements are met.
            </p>
          ) : null}
        </section>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Owner verification</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Identity</dt>
              <dd className="font-medium">
                {owner?.owner_verification_status || "not submitted"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Bank</dt>
              <dd className="font-medium">
                {owner?.bank_verification_status || "not submitted"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Ownership proof</dt>
              <dd className="font-medium">
                {completion.ownership_proof_status || ownershipDoc?.status || "not uploaded"}
              </dd>
            </div>
          </dl>
          {ownershipDoc?.file_url ? (
            <a
              href={ownershipDoc.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-[#0f2740] hover:underline"
            >
              View ownership document
            </a>
          ) : null}
        </section>

        {canReview ? (
          <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Admin decision</h2>
            <label className="mt-3 block text-sm font-medium text-gray-700">
              Comment for owner (required for request changes / reject)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Explain what needs to change or why the listing was rejected."
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={acting !== null || !completion.canApprove}
                onClick={() =>
                  void runAction("approve", `/api/admin/spaces/${spaceId}/approve`)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {acting === "approve" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve → active
              </button>
              <button
                type="button"
                disabled={acting !== null || !comment.trim()}
                onClick={() =>
                  void runAction(
                    "request-changes",
                    `/api/admin/spaces/${spaceId}/request-changes`
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {acting === "request-changes" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Request changes
              </button>
              <button
                type="button"
                disabled={acting !== null || !comment.trim()}
                onClick={() =>
                  void runAction("reject", `/api/admin/spaces/${spaceId}/reject`)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {acting === "reject" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
            </div>
          </section>
        ) : null}

        {message ? (
          <p className="mt-4 text-sm text-gray-800">{message}</p>
        ) : null}
      </div>
    </main>
  );
}
