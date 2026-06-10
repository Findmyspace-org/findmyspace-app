"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Copy, Link2, Loader2, Mail } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";

type InviteTokenRow = {
  id: string;
  property_id: string;
  owner_email: string;
  accepted_by: string | null;
  status: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type PropertyInviteMeta = {
  owner_id: string | null;
  owner_accepted_at: string | null;
  owner_invited_at: string | null;
  owner_email: string | null;
};

function statusClass(status: string) {
  switch (status) {
    case "pending":
      return "bg-blue-100 text-blue-800";
    case "accepted":
      return "bg-green-100 text-green-800";
    case "revoked":
      return "bg-gray-100 text-gray-700";
    case "expired":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

type AdminPropertyInvitePanelProps = {
  propertyId: string;
  propertyName: string;
  ownerEmailDefault?: string | null;
  hasOwner: boolean;
  disabled?: boolean;
};

export function AdminPropertyInvitePanel({
  propertyId,
  propertyName,
  ownerEmailDefault,
  hasOwner,
  disabled = false,
}: AdminPropertyInvitePanelProps) {
  const [tokens, setTokens] = useState<InviteTokenRow[]>([]);
  const [propertyMeta, setPropertyMeta] = useState<PropertyInviteMeta | null>(null);
  const [ownerEmail, setOwnerEmail] = useState(ownerEmailDefault || "");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOwnerEmail(ownerEmailDefault || "");
  }, [ownerEmailDefault]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApiFetch(
        `/api/admin/properties/${propertyId}/invites`
      );
      setTokens((result.invites as InviteTokenRow[]) || []);
      setPropertyMeta((result.property as PropertyInviteMeta) || null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load invites.");
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendInvite(sendEmail: boolean) {
    setGenerating(true);
    setMessage(null);
    setInviteUrl(null);
    try {
      const result = await adminApiFetch(
        `/api/admin/properties/${propertyId}/invites`,
        {
          method: "POST",
          body: JSON.stringify({
            ownerEmail: ownerEmail.trim(),
            sendEmail,
          }),
        }
      );
      setInviteUrl(result.inviteUrl as string);
      setMessage(
        sendEmail && result.emailSent
          ? "Invite sent by email."
          : sendEmail
            ? "Invite created. Email could not be sent — copy the link below."
            : "Invite link generated. Copy and share with the owner."
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create invite.");
    }
    setGenerating(false);
  }

  async function revokeToken(tokenId: string) {
    setRevokingId(tokenId);
    setMessage(null);
    try {
      await adminApiFetch(`/api/admin/properties/invites/${tokenId}/revoke`, {
        method: "POST",
      });
      setMessage("Invite revoked.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not revoke invite.");
    }
    setRevokingId(null);
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const accepted = hasOwner || Boolean(propertyMeta?.owner_accepted_at);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-5 w-5 text-[#0f2740]" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">Owner invitation</h2>
          <p className="mt-1 text-sm text-gray-600">
            One invite grants ownership of all spaces under this property. No per-space
            claim links are required.
          </p>
        </div>
      </div>

      {accepted ? (
        <div className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900 ring-1 ring-green-100">
          <p className="font-semibold">Owner accepted</p>
          {propertyMeta?.owner_accepted_at ? (
            <p className="mt-1">
              Accepted at{" "}
              {format(new Date(propertyMeta.owner_accepted_at), "dd MMM yyyy HH:mm")}
            </p>
          ) : null}
        </div>
      ) : null}

      {!accepted && !disabled ? (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Owner email
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
              disabled={generating || !ownerEmail.trim()}
              onClick={() => void sendInvite(false)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Generate invite link
            </button>
            <button
              type="button"
              disabled={generating || !ownerEmail.trim()}
              onClick={() => void sendInvite(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
            >
              <Mail className="h-4 w-4" />
              Send email
            </button>
          </div>
        </div>
      ) : null}

      {inviteUrl ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-medium uppercase text-gray-500">Invite URL</p>
          <p className="mt-1 break-all text-sm text-gray-800">{inviteUrl}</p>
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
        <h3 className="text-sm font-semibold text-gray-800">Invite history</h3>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No invites yet.</p>
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
                <p className="mt-1 text-gray-700">Invited: {token.owner_email}</p>
                {token.accepted_by && token.used_at ? (
                  <p className="mt-1 text-gray-600">
                    Accepted {format(new Date(token.used_at), "dd MMM yyyy HH:mm")}
                  </p>
                ) : null}
                {token.status === "pending" && !accepted ? (
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
        Property: {propertyName}. Links expire after 14 days.
      </p>
    </section>
  );
}
