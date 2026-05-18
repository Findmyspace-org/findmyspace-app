"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";

type FormStatus = "idle" | "loading" | "success" | "error";

const inputClassName =
  "w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#192a3a] shadow-sm outline-none transition placeholder:text-[#94a3b8] focus:border-[#0c1d2f]/30 focus:ring-2 focus:ring-[#0c1d2f]/10";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(data.error || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f8fafb] pb-16 pt-10 text-[#192a3a] sm:pt-12">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="rounded-3xl border border-[#e5e7eb] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a] sm:text-4xl">
            Contact FindMySpace
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#475569] sm:text-base">
            Have a question about listing, booking, verification or payments? Send us a message
            and we&apos;ll get back to you.
          </p>

          <div className="mt-5 flex items-center gap-2 text-sm text-[#475569]">
            <Mail className="h-4 w-4 shrink-0 text-[#64748b]" aria-hidden />
            <a
              href="mailto:info@findmyspace.co.za"
              className="font-medium text-[#0c1d2f] underline-offset-2 hover:underline"
            >
              info@findmyspace.co.za
            </a>
          </div>

          {status === "success" ? (
            <div
              className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-relaxed text-emerald-900"
              role="status"
            >
              Thanks, your message has been sent. We&apos;ll get back to you soon.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
              {errorMessage ? (
                <div
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  {errorMessage}
                </div>
              ) : null}

              <div>
                <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-[#334155]">
                  Name
                </label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClassName}
                  disabled={status === "loading"}
                />
              </div>

              <div>
                <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-[#334155]">
                  Email
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClassName}
                  disabled={status === "loading"}
                />
              </div>

              <div>
                <label
                  htmlFor="contact-subject"
                  className="mb-1.5 block text-sm font-medium text-[#334155]"
                >
                  Subject
                </label>
                <input
                  id="contact-subject"
                  name="subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={inputClassName}
                  disabled={status === "loading"}
                />
              </div>

              <div>
                <label
                  htmlFor="contact-message"
                  className="mb-1.5 block text-sm font-medium text-[#334155]"
                >
                  Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={`${inputClassName} resize-y min-h-[140px]`}
                  disabled={status === "loading"}
                />
              </div>

              <button
                type="submit"
                disabled={status === "loading"}
                className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl bg-[#c1121f] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_18px_rgba(193,18,31,0.28)] transition hover:bg-[#a70f19] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-[160px]"
              >
                {status === "loading" ? "Sending…" : "Send message"}
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-xs text-[#94a3b8] sm:text-left">
            Prefer email?{" "}
            <Link href="/" className="text-[#0c1d2f] underline-offset-2 hover:underline">
              Back to homepage
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
