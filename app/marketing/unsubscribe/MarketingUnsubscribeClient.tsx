"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function MarketingUnsubscribePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "ready" | "success" | "error">(
    token ? "loading" : "error"
  );
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string>(
    token ? "" : "This unsubscribe link is invalid."
  );

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setStatus("error");
          setMessage(json.error || "This unsubscribe link is invalid.");
          return;
        }
        setMaskedEmail(json.maskedEmail || null);
        setStatus("ready");
      } catch {
        setStatus("error");
        setMessage("Unable to verify this unsubscribe link.");
      }
    })();
  }, [token]);

  async function confirmUnsubscribe() {
    if (!token) return;
    setStatus("loading");
    const res = await fetch("/api/marketing/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setStatus("error");
      setMessage(json.error || "Unsubscribe failed.");
      return;
    }
    setStatus("success");
    setMessage(json.message || "You have been unsubscribed.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-16">
      <div className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[#192a3a]">Unsubscribe from marketing</h1>
        <p className="mt-2 text-sm text-gray-600">
          FindMySpace marketing emails. This page does not require login.
        </p>

        {status === "loading" ? (
          <p className="mt-4 text-sm text-gray-500">Verifying link…</p>
        ) : null}

        {status === "ready" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-gray-700">
              Confirm unsubscribe for {maskedEmail || "your email address"}.
            </p>
            <button
              type="button"
              onClick={() => void confirmUnsubscribe()}
              className="rounded-lg bg-[#c1121f] px-4 py-2 text-sm font-medium text-white"
            >
              Confirm unsubscribe
            </button>
          </div>
        ) : null}

        {status === "success" ? (
          <p className="mt-4 text-sm font-medium text-emerald-700" role="status">
            {message}
          </p>
        ) : null}

        {status === "error" ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
