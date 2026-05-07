"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  HelpCircle,
  Loader2,
  MailQuestion,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";

type ListingQuestion = {
  id: string;
  space_id: string;
  booking_id: string | null;
  renter_id: string;
  owner_id: string;
  question: string;
  answer: "yes" | "no" | "not_applicable" | null;
  status: "pending" | "answered" | "dismissed";
  created_at: string;
  answered_at: string | null;
  space_title: string;
  renter_first_name?: string | null;
};

type Tab = "renter" | "owner";

const ANSWER_LABEL: Record<NonNullable<ListingQuestion["answer"]>, string> = {
  yes: "Yes",
  no: "No",
  not_applicable: "Not applicable",
};

const STATUS_LABEL: Record<ListingQuestion["status"], string> = {
  pending: "Pending host response",
  answered: "Answered",
  dismissed: "Closed",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ListingQuestionsPage() {
  const [renterQuestions, setRenterQuestions] = useState<ListingQuestion[]>([]);
  const [ownerQuestions, setOwnerQuestions] = useState<ListingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("renter");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Please sign in to view your listing questions.");
        setLoading(false);
        return;
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [renterRes, ownerRes] = await Promise.all([
        fetch("/api/listing-questions?role=renter", { headers }),
        fetch("/api/listing-questions?role=owner", { headers }),
      ]);
      const renterJson = (await renterRes.json().catch(() => null)) as
        | { questions?: ListingQuestion[] }
        | null;
      const ownerJson = (await ownerRes.json().catch(() => null)) as
        | { questions?: ListingQuestion[] }
        | null;
      setRenterQuestions(renterJson?.questions || []);
      setOwnerQuestions(ownerJson?.questions || []);

      // If the user is a host with pending questions and no renter questions,
      // default to the owner tab.
      const hasOwnerPending = (ownerJson?.questions || []).some(
        (q) => q.status === "pending"
      );
      const hasRenter = (renterJson?.questions || []).length > 0;
      if (hasOwnerPending && !hasRenter) setTab("owner");
    } catch {
      setError("Could not load your listing questions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(
    questionId: string,
    payload:
      | { action: "answer"; answer: "yes" | "no" | "not_applicable" }
      | { action: "dismiss" }
  ) {
    setActingId(questionId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Please sign in.");
        return;
      }
      const res = await fetch(`/api/listing-questions/${questionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as
        | { question?: ListingQuestion; error?: string }
        | null;
      if (!res.ok || !json?.question) {
        setError(json?.error || "Could not update the question.");
        return;
      }
      setOwnerQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, ...json.question! } : q))
      );
    } catch {
      setError("Could not update the question.");
    } finally {
      setActingId(null);
    }
  }

  const ownerPendingCount = useMemo(
    () => ownerQuestions.filter((q) => q.status === "pending").length,
    [ownerQuestions]
  );
  const isHost = ownerQuestions.length > 0;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f8fafb] px-4 py-8 text-[#0f172a] sm:px-6 sm:py-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold sm:text-3xl">Listing questions</h1>
            <p className="mt-1 text-sm text-[#475569]">
              Controlled yes/no questions between renters and hosts. Contact details and
              exact addresses aren’t shared here.
            </p>
          </div>

          {isHost ? (
            <div
              role="tablist"
              aria-label="Listing questions view"
              className="mb-5 inline-flex rounded-2xl border border-[#e2e8f0] bg-white p-1 shadow-sm"
            >
              <button
                role="tab"
                type="button"
                aria-selected={tab === "renter"}
                onClick={() => setTab("renter")}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  tab === "renter"
                    ? "bg-[#0f2740] text-white shadow-sm"
                    : "text-[#475569] hover:text-[#0f172a]"
                }`}
              >
                My questions
                {renterQuestions.length ? ` · ${renterQuestions.length}` : ""}
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={tab === "owner"}
                onClick={() => setTab("owner")}
                className={`relative rounded-xl px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  tab === "owner"
                    ? "bg-[#0f2740] text-white shadow-sm"
                    : "text-[#475569] hover:text-[#0f172a]"
                }`}
              >
                On my spaces
                {ownerPendingCount > 0 ? (
                  <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#c1121f] px-1.5 text-[11px] font-semibold text-white">
                    {ownerPendingCount}
                  </span>
                ) : null}
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-xl border border-[#fde2e4] bg-[#fff5f5] px-3 py-2.5 text-sm text-[#7f1d1d]">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-6 text-sm text-[#475569]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading your listing questions…
            </div>
          ) : tab === "renter" ? (
            <RenterList questions={renterQuestions} />
          ) : (
            <OwnerList
              questions={ownerQuestions}
              actingId={actingId}
              onAnswer={(id, ans) =>
                answer(id, { action: "answer", answer: ans })
              }
              onDismiss={(id) => answer(id, { action: "dismiss" })}
            />
          )}

          <p className="mt-6 text-xs text-[#94a3b8]">
            Need to message about an active booking?{" "}
            <Link
              href="/dashboard/messages"
              className="font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
            >
              Open messages
            </Link>
            .
          </p>
        </div>
      </main>
    </RequireAuth>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e2e8f0] bg-white px-4 py-10 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#fff5f5] text-[#c1121f]">
        <MailQuestion className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-[#0f172a]">{title}</p>
      <p className="mt-1 text-xs text-[#64748b]">
        Use the “Ask about this space” button on a listing to send a yes/no question to
        the host.
      </p>
    </div>
  );
}

function RenterList({ questions }: { questions: ListingQuestion[] }) {
  if (!questions.length) {
    return <EmptyState title="No listing questions yet." />;
  }
  return (
    <ul className="space-y-3">
      {questions.map((q) => (
        <li
          key={q.id}
          className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/spaces/${q.space_id}`}
              className="text-sm font-semibold text-[#0f172a] hover:underline"
            >
              {q.space_title}
            </Link>
            <span className="text-[11px] text-[#94a3b8]">
              {formatDate(q.created_at)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#1f2937]">{q.question}</p>
          <div className="mt-3">
            {q.status === "answered" && q.answer ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1 text-xs font-semibold text-[#166534]">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                Host answered: {ANSWER_LABEL[q.answer]}
              </span>
            ) : q.status === "dismissed" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafb] px-2.5 py-1 text-xs font-medium text-[#475569]">
                <XCircle className="h-3 w-3" aria-hidden />
                Closed by host
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1 text-xs font-medium text-[#92400e]">
                <HelpCircle className="h-3 w-3" aria-hidden />
                {STATUS_LABEL[q.status]}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function OwnerList({
  questions,
  actingId,
  onAnswer,
  onDismiss,
}: {
  questions: ListingQuestion[];
  actingId: string | null;
  onAnswer: (id: string, answer: "yes" | "no" | "not_applicable") => void;
  onDismiss: (id: string) => void;
}) {
  if (!questions.length) {
    return <EmptyState title="No listing questions yet." />;
  }
  const pending = questions.filter((q) => q.status === "pending");
  const resolved = questions.filter((q) => q.status !== "pending");

  return (
    <div className="space-y-6">
      {pending.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">
            Pending · {pending.length}
          </h2>
          <ul className="space-y-3">
            {pending.map((q) => (
              <OwnerQuestionCard
                key={q.id}
                question={q}
                isActing={actingId === q.id}
                onAnswer={onAnswer}
                onDismiss={onDismiss}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {resolved.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">
            History
          </h2>
          <ul className="space-y-3">
            {resolved.map((q) => (
              <OwnerQuestionCard
                key={q.id}
                question={q}
                isActing={false}
                onAnswer={onAnswer}
                onDismiss={onDismiss}
                readOnly
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function OwnerQuestionCard({
  question,
  isActing,
  onAnswer,
  onDismiss,
  readOnly = false,
}: {
  question: ListingQuestion;
  isActing: boolean;
  onAnswer: (id: string, answer: "yes" | "no" | "not_applicable") => void;
  onDismiss: (id: string) => void;
  readOnly?: boolean;
}) {
  const renterLabel =
    question.renter_first_name?.trim() || "A renter";
  return (
    <li className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/spaces/${question.space_id}`}
          className="text-sm font-semibold text-[#0f172a] hover:underline"
        >
          {question.space_title}
        </Link>
        <span className="text-[11px] text-[#94a3b8]">
          {renterLabel} · {formatDate(question.created_at)}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#1f2937]">{question.question}</p>

      {readOnly ? (
        <div className="mt-3">
          {question.status === "answered" && question.answer ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1 text-xs font-semibold text-[#166534]">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              You answered: {ANSWER_LABEL[question.answer]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafb] px-2.5 py-1 text-xs font-medium text-[#475569]">
              <XCircle className="h-3 w-3" aria-hidden />
              Closed
            </span>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAnswer(question.id, "yes")}
            disabled={isActing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#166534] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#14532d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#166534]/40 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#cbd5e1] motion-reduce:transform-none"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onAnswer(question.id, "no")}
            disabled={isActing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f2740] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#0b1d2f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f2740]/40 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#cbd5e1] motion-reduce:transform-none"
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onAnswer(question.id, "not_applicable")}
            disabled={isActing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-medium text-[#0f172a] shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#cbd5e1] hover:bg-[#f8fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f172a]/15 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none"
          >
            Not applicable
          </button>
          <button
            type="button"
            onClick={() => onDismiss(question.id)}
            disabled={isActing}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-medium text-[#475569] transition-colors duration-200 hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f172a]/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Dismiss
          </button>
          {isActing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#475569]" aria-hidden />
          ) : null}
        </div>
      )}
    </li>
  );
}
