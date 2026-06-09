"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Mail,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  LISTING_CLAIM_INTEREST_STATUSES,
  getListingClaimInterestStatusLabel,
  listingClaimInterestStatusPillClass,
} from "@/lib/listing-lifecycle";
import type { SpaceCrmLinkSummary } from "@/lib/space-crm-link";
import {
  markNotificationsReadByRelatedClient,
} from "@/lib/mark-notifications-read-client";

type ClaimInterestRow = {
  id: string;
  listing_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  message: string | null;
  status: string;
  created_at: string;
  listing: {
    id: string;
    title: string | null;
    status: string | null;
    city: string | null;
    suburb: string | null;
    public_url: string | null;
    admin_edit_url: string;
  } | null;
  crm: {
    crm_organisation_id: string | null;
    crm_contact_id: string | null;
    organisation_name: string | null;
    contact_name: string | null;
  } | null;
};

type ClaimTokenRow = {
  id: string;
  owner_email: string | null;
  status: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

type StatusFilter = "all" | (typeof LISTING_CLAIM_INTEREST_STATUSES)[number];

function statusBadgeClass(status: string) {
  return listingClaimInterestStatusPillClass(status);
}

function statusLabel(status: string) {
  return getListingClaimInterestStatusLabel(status);
}

function ClaimInterestDetailDrawer({
  interestId,
  onClose,
  onUpdated,
}: {
  interestId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [interest, setInterest] = useState<ClaimInterestRow | null>(null);
  const [crmLink, setCrmLink] = useState<SpaceCrmLinkSummary | null>(null);
  const [tokens, setTokens] = useState<ClaimTokenRow[]>([]);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await adminApiFetch(
        `/api/admin/listing-claim-interests/${interestId}`
      );
      const raw = result.interest as {
        id: string;
        listing_id: string;
        name: string;
        email: string;
        phone: string | null;
        role: string | null;
        message: string | null;
        status: string;
        created_at: string;
        spaces: ClaimInterestRow["listing"] & {
          crm_organisation_id?: string | null;
        };
      };
      const space = raw.spaces;
      setInterest({
        id: raw.id,
        listing_id: raw.listing_id,
        name: raw.name,
        email: raw.email,
        phone: raw.phone,
        role: raw.role,
        message: raw.message,
        status: raw.status,
        created_at: raw.created_at,
        listing: space
          ? {
              id: space.id,
              title: space.title,
              status: space.status,
              city: space.city,
              suburb: space.suburb,
              public_url:
                space.status === "unclaimed" ? `/spaces/${space.id}` : null,
              admin_edit_url: `/admin/unclaimed-listings/${space.id}/edit`,
            }
          : null,
        crm: null,
      });
      setCrmLink((result.crm_link as SpaceCrmLinkSummary | null) ?? null);
      setTokens((result.claim_tokens as ClaimTokenRow[]) || []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load details.");
      setInterest(null);
    } finally {
      setLoading(false);
    }
  }, [interestId]);

  useEffect(() => {
    void load();
    void markNotificationsReadByRelatedClient({
      relatedEntityType: "listing_claim_interest",
      relatedEntityId: interestId,
      types: ["listing_claim_interest"],
    });
  }, [interestId, load]);

  async function patch(body: Record<string, unknown>, actionKey: string) {
    setActing(actionKey);
    setMessage(null);
    try {
      const result = await adminApiFetch(
        `/api/admin/listing-claim-interests/${interestId}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );
      if (result.claimUrl) {
        setClaimUrl(result.claimUrl as string);
      }
      if (result.interest) {
        setInterest((prev) =>
          prev
            ? { ...prev, status: (result.interest as { status: string }).status }
            : prev
        );
      }
      if (body.sendClaimLink && result.emailSent) {
        setMessage("Claim link sent by email.");
      } else if (body.generateClaimLink || body.sendClaimLink) {
        setMessage(
          body.sendClaimLink
            ? "Claim link generated. Email could not be sent — copy the link below."
            : "Claim link generated."
        );
      } else if (body.status) {
        setMessage(`Status updated to ${statusLabel(body.status as string)}.`);
      }
      await load();
      onUpdated();
      if (body.status) {
        void markNotificationsReadByRelatedClient({
          relatedEntityType: "listing_claim_interest",
          relatedEntityId: interestId,
          types: ["listing_claim_interest"],
        });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActing(null);
    }
  }

  async function copyLink() {
    if (!claimUrl) return;
    await navigator.clipboard.writeText(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Claim interest</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !interest ? (
            <p className="text-sm text-red-600">{message || "Not found."}</p>
          ) : (
            <div className="space-y-5">
              <div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(interest.status)}`}
                >
                  {statusLabel(interest.status)}
                </span>
                <p className="mt-2 text-xs text-gray-500">
                  Submitted {format(new Date(interest.created_at), "dd MMM yyyy HH:mm")}
                </p>
              </div>

              <section>
                <h3 className="text-sm font-semibold text-gray-900">Claimant</h3>
                <dl className="mt-2 space-y-1 text-sm text-gray-700">
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Name</dt>
                    <dd className="font-medium">{interest.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Email</dt>
                    <dd>
                      <a
                        href={`mailto:${interest.email}`}
                        className="text-[#0f2740] hover:underline"
                      >
                        {interest.email}
                      </a>
                    </dd>
                  </div>
                  {interest.phone ? (
                    <div>
                      <dt className="text-xs uppercase text-gray-500">Phone</dt>
                      <dd>{interest.phone}</dd>
                    </div>
                  ) : null}
                  {interest.role ? (
                    <div>
                      <dt className="text-xs uppercase text-gray-500">Role</dt>
                      <dd>{interest.role}</dd>
                    </div>
                  ) : null}
                  {interest.message ? (
                    <div>
                      <dt className="text-xs uppercase text-gray-500">Message</dt>
                      <dd className="whitespace-pre-wrap">{interest.message}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              {interest.listing ? (
                <section>
                  <h3 className="text-sm font-semibold text-gray-900">Listing</h3>
                  <p className="mt-1 font-medium text-gray-900">
                    {interest.listing.title || "Untitled listing"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[interest.listing.suburb, interest.listing.city]
                      .filter(Boolean)
                      .join(", ")}{" "}
                    · {interest.listing.status}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <Link
                      href={interest.listing.admin_edit_url}
                      className="inline-flex items-center gap-1 font-medium text-[#0f2740] hover:underline"
                      target="_blank"
                    >
                      Admin edit
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    {interest.listing.public_url ? (
                      <Link
                        href={interest.listing.public_url}
                        className="inline-flex items-center gap-1 text-gray-600 hover:underline"
                        target="_blank"
                      >
                        Public page
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {crmLink?.crm_organisation_id ? (
                <section>
                  <h3 className="text-sm font-semibold text-gray-900">CRM</h3>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <Link
                      href={`/space-place/organisations/${crmLink.crm_organisation_id}`}
                      className="font-medium text-[#0f2740] hover:underline"
                      target="_blank"
                    >
                      {crmLink.organisation_name || "Organisation"}
                    </Link>
                    {crmLink.crm_contact_id ? (
                      <Link
                        href={`/space-place/contacts/${crmLink.crm_contact_id}`}
                        className="font-medium text-[#0f2740] hover:underline"
                        target="_blank"
                      >
                        {crmLink.contact_name || "Contact"}
                      </Link>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="text-sm font-semibold text-gray-900">Actions</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {interest.status === "new" ? (
                    <button
                      type="button"
                      disabled={!!acting}
                      onClick={() => void patch({ status: "contacted" }, "contacted")}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 disabled:opacity-60"
                    >
                      {acting === "contacted" ? "…" : "Mark contacted"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() =>
                      void patch({ generateClaimLink: true }, "generate")
                    }
                    className="rounded-lg bg-[#0f2740] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {acting === "generate" ? "…" : "Generate claim link"}
                  </button>
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() => void patch({ sendClaimLink: true }, "send")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#0f2740] px-3 py-1.5 text-xs font-semibold text-[#0f2740] disabled:opacity-60"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {acting === "send" ? "…" : "Send claim link"}
                  </button>
                  {interest.status !== "claim_link_sent" ? (
                    <button
                      type="button"
                      disabled={!!acting}
                      onClick={() =>
                        void patch({ status: "claim_link_sent" }, "link_sent")
                      }
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 disabled:opacity-60"
                    >
                      {acting === "link_sent" ? "…" : "Mark claim link sent"}
                    </button>
                  ) : null}
                  {interest.status !== "closed" ? (
                    <button
                      type="button"
                      disabled={!!acting}
                      onClick={() => void patch({ status: "closed" }, "close")}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 disabled:opacity-60"
                    >
                      {acting === "close" ? "…" : "Close"}
                    </button>
                  ) : null}
                </div>
              </section>

              {claimUrl ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium uppercase text-gray-500">
                    Claim URL
                  </p>
                  <p className="mt-1 break-all text-sm text-gray-800">{claimUrl}</p>
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#0f2740] hover:underline"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              ) : null}

              <section>
                <h3 className="text-sm font-semibold text-gray-800">
                  Claim link history
                </h3>
                {tokens.length === 0 ? (
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
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(token.status)}`}
                          >
                            {token.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {format(new Date(token.created_at), "dd MMM yyyy HH:mm")}
                          </span>
                        </div>
                        {token.owner_email ? (
                          <p className="mt-1 text-gray-700">
                            Invited: {token.owner_email}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {message ? <p className="text-sm text-gray-700">{message}</p> : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function AdminClaimInterestsPageContent() {
  const searchParams = useSearchParams();
  const openFromUrl = searchParams.get("open");
  const listingFilter = searchParams.get("listing");
  const statusFromUrl = searchParams.get("status");

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ClaimInterestRow[]>([]);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    if (
      statusFromUrl &&
      LISTING_CLAIM_INTEREST_STATUSES.includes(
        statusFromUrl as (typeof LISTING_CLAIM_INTEREST_STATUSES)[number]
      )
    ) {
      return statusFromUrl as StatusFilter;
    }
    return "all";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params =
        statusFilter !== "all" ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const result = await adminApiFetch(
        `/api/admin/listing-claim-interests${params}`
      );
      setRows((result.interests as ClaimInterestRow[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load.");
      setRows([]);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    if (
      statusFromUrl &&
      LISTING_CLAIM_INTEREST_STATUSES.includes(
        statusFromUrl as (typeof LISTING_CLAIM_INTEREST_STATUSES)[number]
      )
    ) {
      setStatusFilter(statusFromUrl as StatusFilter);
    }
  }, [statusFromUrl]);

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

  useEffect(() => {
    if (openFromUrl) {
      setSelectedId(openFromUrl);
      const nextUrl =
        statusFilter !== "all"
          ? `/admin/listing-claim-interests?status=${encodeURIComponent(statusFilter)}`
          : "/admin/listing-claim-interests";
      window.history.replaceState({}, "", nextUrl);
    }
  }, [openFromUrl, statusFilter]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = rows;
    if (listingFilter) {
      list = list.filter((row) => row.listing_id === listingFilter);
    }
    if (!q) return list;
    return list.filter((row) => {
      const haystack = [
        row.name,
        row.email,
        row.phone,
        row.role,
        row.message,
        row.listing?.title,
        row.crm?.organisation_name,
        row.crm?.contact_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [listingFilter, rows, searchQuery]);

  if (loading && role === null) {
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
      <div className="mx-auto max-w-7xl">
        <AdminNav current="listing-claim-interests" />

        <h1 className="text-2xl font-semibold text-gray-900">Claim interests</h1>
        <p className="mt-1 text-sm text-gray-600">
          Owner/manager requests to claim unclaimed listings from the public page.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {LISTING_CLAIM_INTEREST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[220px] flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-600">Search</span>
            <div className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Listing, name, email, phone, CRM…"
                className="w-full border-0 bg-transparent text-sm outline-none"
              />
            </div>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}

        {loading ? (
          <p className="mt-8 text-gray-500">Loading claim interests…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-gray-500">No claim interests found.</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <th className="px-4 py-3">Listing</th>
                  <th className="px-4 py-3">Claimant</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="hidden px-4 py-3 lg:table-cell">CRM</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Submitted</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const location =
                    [row.listing?.suburb, row.listing?.city]
                      .filter(Boolean)
                      .join(", ") || "—";
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50/80"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">
                          {row.listing?.title || "Untitled"}
                        </p>
                        <p className="text-xs text-gray-500">{location}</p>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <p>{row.email}</p>
                        {row.phone ? (
                          <p className="text-xs text-gray-500">{row.phone}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{row.role || "—"}</td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {row.crm ? (
                          <span className="inline-flex items-start gap-1 text-xs">
                            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0f2740]" />
                            <span>
                              {row.crm.organisation_name || "Linked org"}
                              {row.crm.contact_name ? (
                                <span className="block text-gray-500">
                                  {row.crm.contact_name}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">
                        {format(new Date(row.created_at), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          className="font-medium text-[#0f2740] hover:underline"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId ? (
        <ClaimInterestDetailDrawer
          interestId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={() => void load()}
        />
      ) : null}
    </main>
  );
}

export default function AdminListingClaimInterestsPage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <AdminClaimInterestsPageContent />
    </Suspense>
  );
}
