"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Copy, Link2, Loader2, Mail } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";

type ClaimTokenRow = {
  id: string;
  listing_id: string;
  owner_email: string | null;
  claimed_by: string | null;
  status: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type SpaceClaimMeta = {
  claimed_at: string | null;
  owner_id: string | null;
  status: string | null;
};

function statusClass(status: string) {
  switch (status) {
    case "pending":
      return "bg-blue-100 text-blue-800";
    case "claimed":
      return "bg-green-100 text-green-800";
    case "revoked":
      return "bg-gray-100 text-gray-700";
    case "expired":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

type AdminListingClaimPanelProps = {
  spaceId: string;
  listingTitle: string;
  spaceStatus: string | null;
  disabled?: boolean;
};

export function AdminListingClaimPanel({
  spaceId,
  listingTitle,
  spaceStatus,
  disabled = false,
}: AdminListingClaimPanelProps) {
  const [tokens, setTokens] = useState<ClaimTokenRow[]>([]);
  const [spaceMeta, setSpaceMeta] = useState<SpaceClaimMeta | null>(null);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApiFetch(
        `/api/admin/listing-claims?spaceId=${encodeURIComponent(spaceId)}`
      );
      setTokens((result.tokens as ClaimTokenRow[]) || []);
      setSpaceMeta((result.space as SpaceClaimMeta) || null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load claim links.");
    }
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateLink(sendEmail: boolean) {
    setGenerating(true);
    setMessage(null);
    setClaimUrl(null);
    try {
      const result = await adminApiFetch("/api/admin/listing-claims", {
        method: "POST",
        body: JSON.stringify({
          spaceId,
          ownerEmail: ownerEmail.trim() || null,
          sendEmail,
        }),
      });
      setClaimUrl(result.claimUrl as string);
      setMessage(
        sendEmail && result.emailSent
          ? "Claim link generated and email sent."
          : sendEmail && ownerEmail.trim()
            ? "Claim link generated. Email could not be sent — copy the link below."
            : "Claim link generated. Copy and share with the owner."
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not generate link.");
    }
    setGenerating(false);
  }

  async function revokeToken(tokenId: string) {
    setRevokingId(tokenId);
    setMessage(null);
    try {
      await adminApiFetch(`/api/admin/listing-claims/${tokenId}/revoke`, {
        method: "POST",
      });
      setMessage("Claim link revoked.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not revoke link.");
    }
    setRevokingId(null);
  }

  async function copyLink() {
    if (!claimUrl) return;
    await navigator.clipboard.writeText(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const claimable = spaceStatus === "draft" || spaceStatus === "unclaimed";
  const claimed = spaceStatus === "owner_claimed" || Boolean(spaceMeta?.owner_id);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-5 w-5 text-[#0f2740]" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">Owner claim link</h2>
          <p className="mt-1 text-sm text-gray-600">
            Generate a secure link for the property owner. Claiming does not make the
            listing live or bookable.
          </p>
        </div>
      </div>

      {claimed ? (
        <div className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900 ring-1 ring-green-100">
          <p className="font-semibold">Listing claimed</p>
          {spaceMeta?.claimed_at ? (
            <p className="mt-1">
              Claimed at {format(new Date(spaceMeta.claimed_at), "dd MMM yyyy HH:mm")}
            </p>
          ) : null}
        </div>
      ) : null}

      {!claimable && !claimed ? (
        <p className="mt-4 text-sm text-gray-600">
          Claim links are only available for draft or unclaimed listings.
        </p>
      ) : null}

      {claimable && !disabled ? (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Owner email (optional)
            </span>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="owner@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={generating}
              onClick={() => void generateLink(false)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Generate claim link
            </button>
            <button
              type="button"
              disabled={generating || !ownerEmail.trim()}
              onClick={() => void generateLink(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
            >
              <Mail className="h-4 w-4" />
              Send email
            </button>
          </div>
        </div>
      ) : null}

      {claimUrl ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-medium uppercase text-gray-500">Claim URL</p>
          <p className="mt-1 break-all text-sm text-gray-800">{claimUrl}</p>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#0f2740] hover:underline"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-gray-800">Claim link history</h3>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No claim links yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="rounded-lg border border-gray-100 bg-[#fafbfc] px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(token.status)}`}
                  >
                    {token.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {format(new Date(token.created_at), "dd MMM yyyy HH:mm")}
                  </span>
                </div>
                {token.owner_email ? (
                  <p className="mt-1 text-gray-700">Invited: {token.owner_email}</p>
                ) : null}
                {token.claimed_by && token.used_at ? (
                  <p className="mt-1 text-gray-600">
                    Claimed {format(new Date(token.used_at), "dd MMM yyyy HH:mm")}
                  </p>
                ) : null}
                {token.status === "pending" && claimable ? (
                  <button
                    type="button"
                    disabled={revokingId === token.id}
                    onClick={() => void revokeToken(token.id)}
                    className="mt-2 text-xs font-medium text-red-700 hover:underline disabled:opacity-60"
                  >
                    {revokingId === token.id ? "Revoking…" : "Revoke"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Listing: {listingTitle}. Links expire after 14 days.
      </p>
    </section>
  );
}
