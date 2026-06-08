"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sanitizeNextPath } from "@/lib/auth-redirect";
import {
  LISTING_ENQUIRY_DURATION_TYPES,
  UNCLAIMED_LISTING_BADGE,
} from "@/lib/listing-lifecycle";

type ListingEnquiryFormProps = {
  listingId: string;
  listingTitle: string;
};

export function ListingEnquiryForm({
  listingId,
  listingTitle,
}: ListingEnquiryFormProps) {
  const [loadingSession, setLoadingSession] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [durationType, setDurationType] = useState<string>("daily");
  const [purpose, setPurpose] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const returnPath = sanitizeNextPath(`/spaces/${listingId}`, `/spaces/${listingId}`);
  const loginUrl = `/login?next=${encodeURIComponent(returnPath)}`;
  const signupUrl = `/signup?next=${encodeURIComponent(returnPath)}`;

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      setUserId(user?.id ?? null);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, full_name, email, phone")
          .eq("id", user.id)
          .maybeSingle();

        const row = profile as {
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
        } | null;

        const fullName =
          row?.full_name?.trim() ||
          [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim();

        if (fullName) setName(fullName);
        if (row?.email) setEmail(row.email);
        if (user.email && !row?.email) setEmail(user.email);
        if (row?.phone) setPhone(row.phone);
      }

      setLoadingSession(false);
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!userId) {
      setError("Please sign in to submit a request.");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!requestedDate) {
      setError("Please choose a preferred date.");
      return;
    }
    if (!(LISTING_ENQUIRY_DURATION_TYPES as readonly string[]).includes(durationType)) {
      setError("Please choose a duration type.");
      return;
    }

    setSubmitting(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setSubmitting(false);
      setError("Session expired. Please sign in again.");
      return;
    }

    let requestedStart: string | null = null;
    if (requestedDate) {
      const iso = requestedTime
        ? `${requestedDate}T${requestedTime}:00`
        : `${requestedDate}T09:00:00`;
      requestedStart = new Date(iso).toISOString();
    }

    const res = await fetch("/api/listing-enquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        listingId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        requestedStart,
        durationType,
        purpose: purpose.trim() || null,
        message: message.trim() || null,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      setError(json.error || "Could not submit your request.");
      return;
    }

    setSuccess(true);
  }

  if (loadingSession) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </p>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Sign in to request this space</p>
        <p className="mt-1 text-amber-900/90">
          This space is not yet fully bookable. Sign in or create an account to
          tell us what you need — FindMySpace will follow up and confirm
          availability.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={loginUrl}
            className="inline-flex rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
          <Link
            href={signupUrl}
            className="inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950"
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <p className="font-semibold">Thanks, we received your request.</p>
        <p className="mt-2 leading-relaxed">
          This space is not yet fully bookable, but FindMySpace will follow up
          and confirm availability for{" "}
          <span className="font-medium">{listingTitle}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 ring-1 ring-amber-100">
        {UNCLAIMED_LISTING_BADGE}
      </p>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Phone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Preferred date
          </span>
          <input
            type="date"
            value={requestedDate}
            onChange={(e) => setRequestedDate(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Preferred time (optional)
          </span>
          <input
            type="time"
            value={requestedTime}
            onChange={(e) => setRequestedTime(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Duration type
        </span>
        <select
          value={durationType}
          onChange={(e) => setDurationType(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          {LISTING_ENQUIRY_DURATION_TYPES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Purpose / use case
        </span>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={2}
          placeholder="e.g. team offsite, storage, pop-up shop"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Message / notes
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Anything else we should know?"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center rounded-xl bg-[#0f2740] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          "Submit request"
        )}
      </button>
    </form>
  );
}
