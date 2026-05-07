"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * SpaceAssistant — guided "Ask about this space" entry point.
 *
 * Architecture notes (UI-only for now; backend lands later):
 *   - TODO: connect OpenAI / Vercel AI SDK endpoint (e.g. `/api/space-assistant`).
 *   - TODO: inject `listing_questionnaires.data` for the active listing into the prompt context.
 *   - TODO: inject `listing_booking_requirements` (host-defined gating questions / docs).
 *   - TODO: inject normalised features (`space_attributes`) + cancellation / access policies.
 *   - TODO: add confidence-score handling and an explicit "Escalate to human review" path
 *           when the assistant is unsure or the question is out-of-scope.
 *
 * Intentionally NO direct host messaging, email, or phone exposure here. The
 * assistant is the communication layer for the buyer side.
 */

type Props = {
  spaceId: string;
  spaceTitle: string;
  spaceType?: string | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  kind?: "context" | "safety" | "fallback" | "error";
};

const SUGGESTED_PROMPTS = [
  "Will my vehicle fit?",
  "What access hours are allowed?",
  "Is this suitable for long-term storage?",
  "What do I need before booking?",
  "Is this space secure?",
  "What size items fit here?",
];

const NETWORK_ERROR_REPLY =
  "I couldn’t reach the assistant just now. Please try again in a moment, or include your question in your booking request.";

const HOST_QUESTION_TEMPLATES = [
  "Is weekend access allowed?",
  "Is the space covered?",
  "Is 24/7 access available?",
  "Can I store furniture here?",
  "Can I park a trailer here?",
  "Is the space suitable for long-term use?",
];

type HostQuestionStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "blocked"; message: string }
  | { kind: "error"; message: string }
  | { kind: "auth_required" };

export default function SpaceAssistant({
  spaceId,
  spaceTitle,
  spaceType,
}: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Secondary host yes/no question flow state.
  const [hostFormOpen, setHostFormOpen] = useState(false);
  const [hostQuestion, setHostQuestion] = useState("");
  const [hostStatus, setHostStatus] = useState<HostQuestionStatus>({ kind: "idle" });

  // Allow other UI on the listing page (e.g. the secondary "Ask about this
  // space" button) to open the assistant via a window-level CustomEvent.
  useEffect(() => {
    function handleOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("findmyspace:open-assistant", handleOpenEvent);
    return () => {
      window.removeEventListener("findmyspace:open-assistant", handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const focusTimer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 250);
      return () => {
        document.removeEventListener("keydown", handleKey);
        document.body.style.overflow = previousOverflow;
        window.clearTimeout(focusTimer);
      };
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isThinking]);

  const hasConversation = messages.length > 0;

  const introSubtitle = useMemo(() => {
    return "Get quick answers about access, fit, booking requirements, and space details.";
  }, []);

  async function submitQuestion(question: string) {
    const text = question.trim();
    if (!text || isThinking) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setIsThinking(true);
    try {
      const res = await fetch("/api/space-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, question: text }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { kind?: "context" | "safety" | "fallback"; answer?: string; error?: string }
        | null;

      if (!res.ok || !payload?.answer) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: payload?.error
              ? `${payload.error}. ${NETWORK_ERROR_REPLY}`
              : NETWORK_ERROR_REPLY,
            kind: "error",
          },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: payload.answer ?? NETWORK_ERROR_REPLY,
          kind: payload.kind ?? "context",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: NETWORK_ERROR_REPLY, kind: "error" },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitQuestion(input);
  }

  async function submitHostQuestion(e: React.FormEvent) {
    e.preventDefault();
    const text = hostQuestion.trim();
    if (!text || hostStatus.kind === "sending") return;

    setHostStatus({ kind: "sending" });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setHostStatus({ kind: "auth_required" });
        return;
      }

      const res = await fetch("/api/listing-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ spaceId, question: text }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { kind?: "sent" | "blocked"; reason?: string; error?: string }
        | null;

      if (!res.ok) {
        setHostStatus({
          kind: "error",
          message:
            payload?.error ||
            "Could not send your question. Please try again in a moment.",
        });
        return;
      }
      if (payload?.kind === "blocked") {
        setHostStatus({
          kind: "blocked",
          message:
            payload.reason ||
            "Contact details and exact access information are shared only after a booking is approved and payment is completed.",
        });
        return;
      }
      setHostStatus({ kind: "sent" });
      setHostQuestion("");
    } catch {
      setHostStatus({
        kind: "error",
        message: "Could not send your question. Please try again in a moment.",
      });
    }
  }

  function resetHostForm() {
    setHostFormOpen(false);
    setHostQuestion("");
    setHostStatus({ kind: "idle" });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask about this space"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-space-id={spaceId}
        data-space-type={spaceType ?? undefined}
        className={`group fixed bottom-4 right-3 z-[110] inline-flex items-end justify-center bg-transparent p-0 transition-all duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/40 focus-visible:ring-offset-2 focus-visible:rounded-2xl active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-colors sm:bottom-6 sm:right-6 ${
          open ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <Image
          src="/images/ask-about-space.png"
          alt=""
          width={822}
          height={598}
          priority={false}
          className="h-auto w-[120px] select-none drop-shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition-[filter,transform] duration-300 ease-out group-hover:drop-shadow-[0_18px_30px_rgba(15,23,42,0.24)] sm:w-[150px]"
        />
      </button>

      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-[120] transition-opacity duration-200 ease-out ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className="absolute inset-0 bg-[#0f172a]/45 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          aria-hidden
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ask about this space"
          className={`absolute left-0 right-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl bg-white shadow-[0_-30px_70px_rgba(15,23,42,0.25)] transition-transform duration-300 ease-out sm:bottom-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-l-3xl sm:rounded-tr-none sm:shadow-[-30px_0_70px_rgba(15,23,42,0.20)] motion-reduce:transition-none ${
            open
              ? "translate-y-0 sm:translate-x-0"
              : "translate-y-full sm:translate-y-0 sm:translate-x-full"
          }`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#eef2f6] px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
            <div className="flex items-start gap-3 min-w-0">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fff5f5] to-[#fde2e4] text-[#c1121f]">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-base font-semibold text-[#0f172a] sm:text-lg">
                  Ask about this space
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#64748b] sm:text-sm">
                  {introSubtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#475569] transition-colors duration-200 hover:border-[#cbd5e1] hover:bg-[#f8fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div
            ref={messagesRef}
            className="flex-1 overflow-y-auto px-5 py-4 sm:px-6"
          >
            {!hasConversation ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                    Suggested questions
                  </p>
                  <p className="mt-1 text-xs text-[#94a3b8]">
                    About <span className="font-medium text-[#475569]">{spaceTitle}</span>
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => submitQuestion(prompt)}
                      className="group flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-left text-sm font-medium text-[#0f172a] shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#c1121f]/30 hover:bg-[#fffafa] hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30 focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-colors"
                    >
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff5f5] text-[#c1121f]">
                        <Sparkles className="h-3 w-3" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 break-words">{prompt}</span>
                    </button>
                  ))}
                </div>
                <p className="rounded-xl border border-dashed border-[#e2e8f0] bg-[#f8fafb] px-3 py-2 text-[11px] leading-relaxed text-[#64748b]">
                  This assistant doesn’t share host contact details. The host will confirm
                  any final details before payment.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const tone = message.kind ?? "context";
                  const assistantBubble =
                    tone === "safety"
                      ? "rounded-bl-md border border-[#fde2e4] bg-[#fff5f5] text-[#7f1d1d]"
                      : tone === "error"
                        ? "rounded-bl-md border border-[#fde2e4] bg-[#fff8f8] text-[#7f1d1d]"
                        : tone === "fallback"
                          ? "rounded-bl-md border border-[#eef2f6] bg-[#f8fafb] text-[#334155]"
                          : "rounded-bl-md border border-[#eef2f6] bg-[#fafbfc] text-[#0f172a]";
                  return (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                          isUser
                            ? "rounded-br-md bg-[#0f2740] text-white"
                            : assistantBubble
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  );
                })}
                {isThinking ? (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-[#eef2f6] bg-[#fafbfc] px-3.5 py-2.5 text-sm text-[#64748b]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c1121f]" />
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c1121f]"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c1121f]"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="border-t border-[#eef2f6] bg-[#fafbfc] px-4 py-3 sm:px-6 sm:py-4">
            {hostStatus.kind === "sent" ? (
              <div className="flex items-start gap-3 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2.5 text-sm text-[#166534]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Question sent.</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#15803d]">
                    The host can reply Yes, No, or Not applicable. You’ll be notified when
                    they answer.
                  </p>
                  <button
                    type="button"
                    onClick={resetHostForm}
                    className="mt-1.5 text-xs font-medium text-[#166534] underline-offset-2 hover:underline"
                  >
                    Ask another
                  </button>
                </div>
              </div>
            ) : !hostFormOpen ? (
              <button
                type="button"
                onClick={() => setHostFormOpen(true)}
                className="group flex w-full items-start gap-3 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#cbd5e1] hover:bg-[#f8fafb] hover:shadow-[0_8px_18px_rgba(15,23,42,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30 focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-colors"
                aria-expanded={hostFormOpen}
              >
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff5f5] text-[#c1121f]">
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#0f172a]">
                    Still need a host answer?
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[#64748b]">
                    Try asking the assistant first — it can answer most questions
                    instantly. Otherwise ask the host a yes/no question.
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[#c1121f]">
                    Ask the host a yes/no question
                    <ChevronDown className="h-3 w-3 transition-transform duration-200 group-hover:translate-y-0.5" aria-hidden />
                  </span>
                </span>
              </button>
            ) : (
              <form
                onSubmit={submitHostQuestion}
                className="space-y-2.5 rounded-xl border border-[#e2e8f0] bg-white p-3 shadow-sm sm:p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0f172a]">
                      Ask the host a yes/no question
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#64748b]">
                      Please ask a question the host can answer with Yes, No, or Not
                      applicable.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetHostForm}
                    aria-label="Cancel host question"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#475569] transition-colors duration-200 hover:border-[#cbd5e1] hover:bg-[#f8fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {HOST_QUESTION_TEMPLATES.map((template) => (
                    <button
                      key={template}
                      type="button"
                      onClick={() => {
                        setHostQuestion(template);
                        setHostStatus({ kind: "idle" });
                      }}
                      className="rounded-full border border-[#e5e7eb] bg-[#f8fafb] px-2.5 py-1 text-[11px] font-medium text-[#475569] transition-colors duration-200 hover:border-[#cbd5e1] hover:bg-white hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30"
                    >
                      {template}
                    </button>
                  ))}
                </div>

                <textarea
                  value={hostQuestion}
                  onChange={(e) => {
                    setHostQuestion(e.target.value);
                    if (
                      hostStatus.kind === "blocked" ||
                      hostStatus.kind === "error"
                    ) {
                      setHostStatus({ kind: "idle" });
                    }
                  }}
                  placeholder="Example: Is weekend access allowed?"
                  rows={2}
                  maxLength={280}
                  className="block w-full resize-none rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm leading-relaxed text-[#0f172a] placeholder:text-[#94a3b8] shadow-sm transition-colors duration-200 focus:border-[#c1121f]/40 focus:outline-none focus:ring-2 focus:ring-[#c1121f]/15"
                />

                {hostStatus.kind === "blocked" ? (
                  <p className="rounded-xl border border-[#fde2e4] bg-[#fff5f5] px-3 py-2 text-[12px] leading-relaxed text-[#7f1d1d]">
                    {hostStatus.message}
                  </p>
                ) : null}
                {hostStatus.kind === "error" ? (
                  <p className="rounded-xl border border-[#fde2e4] bg-[#fff8f8] px-3 py-2 text-[12px] leading-relaxed text-[#7f1d1d]">
                    {hostStatus.message}
                  </p>
                ) : null}
                {hostStatus.kind === "auth_required" ? (
                  <p className="rounded-xl border border-[#e2e8f0] bg-[#f8fafb] px-3 py-2 text-[12px] leading-relaxed text-[#475569]">
                    Please{" "}
                    <a
                      href={`/login?redirect=/spaces/${spaceId}`}
                      className="font-medium text-[#c1121f] underline-offset-2 hover:underline"
                    >
                      sign in
                    </a>{" "}
                    to ask the host a yes/no question.
                  </p>
                ) : null}

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <p className="text-[11px] leading-relaxed text-[#94a3b8]">
                    Contact details and exact access info aren’t shared here.
                  </p>
                  <button
                    type="submit"
                    disabled={!hostQuestion.trim() || hostStatus.kind === "sending"}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#c1121f] px-3 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(193,18,31,0.32)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#a70f19] hover:shadow-[0_8px_20px_rgba(193,18,31,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#cbd5e1] disabled:shadow-none disabled:hover:translate-y-0 motion-reduce:transform-none motion-reduce:transition-colors"
                  >
                    {hostStatus.kind === "sending" ? "Sending…" : "Send question to host"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-[#eef2f6] bg-white px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6 sm:pt-4 sm:pb-5"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-[#e2e8f0] bg-white px-3 py-2 shadow-sm transition-colors duration-200 focus-within:border-[#c1121f]/40 focus-within:ring-2 focus-within:ring-[#c1121f]/15">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about this space..."
                aria-label="Ask a question about this space"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || isThinking}
                aria-label="Send question"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#c1121f] text-white shadow-[0_4px_14px_rgba(193,18,31,0.32)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#a70f19] hover:shadow-[0_8px_20px_rgba(193,18,31,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f] focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#cbd5e1] disabled:shadow-none disabled:hover:translate-y-0 motion-reduce:transform-none motion-reduce:transition-colors"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#94a3b8]">
              Replies are guided by listing details. Final confirmation happens with the
              host before payment.
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
