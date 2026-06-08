"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LISTING_ENQUIRY_DURATION_TYPES } from "@/lib/listing-lifecycle";

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

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;
      setUserId(user?.id ?? null);
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
      if (!name.trim()) {
        setError("Please enter your name.");
        return;
      }
      if (!email.trim()) {
        setError("Please enter your email.");
        return;
      }
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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (userId) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setSubmitting(false);
        setError("Session expired. Please sign in again.");
        return;
      }
      headers.Authorization = `Bearer ${token}`;
    }

    let requestedStart: string | null = null;
    if (requestedDate) {
      const iso = requestedTime
        ? `${requestedDate}T${requestedTime}:00`
        : `${requestedDate}T09:00:00`;
      requestedStart = new Date(iso).toISOString();
    }

    const payload: Record<string, unknown> = {
      listingId,
      requestedStart,
      durationType,
      purpose: purpose.trim() || null,
      message: message.trim() || null,
    };

    if (!userId) {
      payload.name = name.trim();
      payload.email = email.trim();
      payload.phone = phone.trim() || null;
    }

    const res = await fetch("/api/listing-enquiries", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
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

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <p className="font-semibold">Thanks, we received your request.</p>
        <p className="mt-2 leading-relaxed">
          We will follow up and confirm availability for{" "}
          <span className="font-medium">{listingTitle}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      {!userId ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Your details
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
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
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Phone</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      ) : null}

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
