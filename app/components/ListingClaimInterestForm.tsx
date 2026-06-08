"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

type ListingClaimInterestFormProps = {
  listingId: string;
  listingTitle: string;
  onSuccess?: () => void;
};

export function ListingClaimInterestForm({
  listingId,
  listingTitle,
  onSuccess,
}: ListingClaimInterestFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/listing-claim-interests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        role: role.trim() || null,
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
    onSuccess?.();
  }

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <p className="font-semibold">Thanks — we received your interest.</p>
        <p className="mt-2 leading-relaxed">
          Our team will review your request for{" "}
          <span className="font-medium">{listingTitle}</span> and contact you if this
          listing can be claimed. You will receive a secure claim link after verification
          — you cannot claim directly from this page.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center rounded-xl border border-[#0f2740] bg-white px-5 py-3 text-sm font-semibold text-[#0f2740] transition hover:bg-gray-50 sm:w-auto"
      >
        Claim this space
      </button>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-900">Tell us about your connection to this space</p>

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

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Your role / relationship to this space
        </span>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. property owner, facility manager"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Your message..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-xl bg-[#0f2740] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Submit claim interest"
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
