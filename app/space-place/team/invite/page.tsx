"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  SPACER_INVITE_DISCLAIMER,
  SPACER_INVITE_HELPER,
} from "@/lib/space-place/access";
import { useSpacePlace } from "../../SpacePlaceContext";
import { PageTitle, PrimaryButton } from "../../components/SpacePlaceShell";

export default function InviteSpacerPage() {
  const { isAdmin } = useSpacePlace();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/space-place/today");
    }
  }, [isAdmin, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInviteUrl(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError("Please sign in again.");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/space-place/spacer-invites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Could not create invite.");
      return;
    }

    setInviteUrl(data.inviteUrl as string);
  }

  if (!isAdmin) return null;

  return (
    <div>
      <Link
        href="/space-place/team"
        className="mb-3 inline-block text-sm font-semibold text-[#c1121f]"
      >
        ← Team
      </Link>
      <PageTitle title="Invite Spacer" subtitle={SPACER_INVITE_HELPER} />
      <p className="mb-4 text-sm text-neutral-600">{SPACER_INVITE_DISCLAIMER}</p>

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold">Full name</span>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Phone (optional)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <PrimaryButton type="submit" disabled={saving}>
          {saving ? "Creating invite…" : "Create invite"}
        </PrimaryButton>
      </form>

      {inviteUrl ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-900">Invite link ready</p>
          <p className="mt-2 break-all text-sm text-emerald-800">{inviteUrl}</p>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(inviteUrl)}
            className="mt-3 text-sm font-semibold text-[#c1121f]"
          >
            Copy link
          </button>
          <p className="mt-2 text-xs text-emerald-800">
            Email sending is not configured yet — share this link directly.
          </p>
        </div>
      ) : null}
    </div>
  );
}
