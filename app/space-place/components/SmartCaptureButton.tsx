"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/space-place/constants";
import type {
  SmartCaptureConfirmPayload,
  SmartCaptureParseResult,
} from "@/lib/space-place/smart-capture-types";
import { PrimaryButton } from "./SpacePlaceShell";

type Step = "input" | "confirm";

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function ActionBadge({ action }: { action: "match" | "create" }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
        action === "create"
          ? "bg-amber-100 text-amber-900"
          : "bg-emerald-100 text-emerald-900"
      }`}
    >
      {action === "create" ? "Create new" : "Existing"}
    </span>
  );
}

export function SmartCaptureButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [parseResult, setParseResult] = useState<SmartCaptureParseResult | null>(
    null
  );
  const [confirmDraft, setConfirmDraft] = useState<SmartCaptureConfirmPayload | null>(
    null
  );
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("input");
    setText("");
    setParseResult(null);
    setConfirmDraft(null);
    setError(null);
    setAnalysing(false);
    setSaving(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function buildConfirmDraft(result: SmartCaptureParseResult): SmartCaptureConfirmPayload {
    return {
      rawText: result.rawText,
      organisation: {
        create: result.organisation.action === "create",
        id: result.organisation.id,
        name: result.organisation.name,
        pipeline_stage: result.organisation.pipeline_stage,
        notes: result.organisation.notes,
      },
      contact: {
        create: result.contact.action === "create",
        id: result.contact.id,
        full_name: result.contact.name,
        email: result.contact.email,
        phone: result.contact.phone,
      },
      engagement: {
        type: result.engagement.type,
        summary: result.engagement.summary,
        outcome: null,
      },
      followUp: {
        create: Boolean(
          result.followUp.title?.trim() && result.followUp.due_date
        ),
        title: result.followUp.title,
        due_date: result.followUp.due_date,
      },
    };
  }

  async function analyse() {
    if (!text.trim()) return;
    setAnalysing(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError("Please sign in again.");
      setAnalysing(false);
      return;
    }

    const res = await fetch("/api/space-place/smart-capture/parse", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text.trim() }),
    });

    const data = await res.json();
    setAnalysing(false);

    if (!res.ok) {
      setError(data.error || "Could not analyse text.");
      return;
    }

    const result = data as SmartCaptureParseResult;
    setParseResult(result);
    setConfirmDraft(buildConfirmDraft(result));
    setStep("confirm");
  }

  async function confirmSave() {
    if (!confirmDraft) return;
    setSaving(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError("Please sign in again.");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/space-place/smart-capture/confirm", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(confirmDraft),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Could not save.");
      return;
    }

    close();
    router.push(`/space-place/organisations/${data.organisationId}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] items-center gap-2 rounded-full border-2 border-[#c1121f] bg-white px-5 py-2.5 text-sm font-bold text-[#c1121f] shadow-md"
      >
        <Sparkles className="h-4 w-4" />
        SMART CAPTURE
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="smart-capture-title"
          onClick={close}
        >
          <div
            className="flex max-h-[min(90vh,calc(100dvh-6rem-env(safe-area-inset-bottom)))] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative shrink-0 border-b border-neutral-100 px-5 pb-3 pt-5">
              <button
                type="button"
                onClick={close}
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <h3 id="smart-capture-title" className="pr-10 text-xl font-bold">
                Smart Capture
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                {step === "input"
                  ? "Describe the interaction — we will match or create the space and contact."
                  : "Review before saving."}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {step === "input" ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={7}
                  placeholder="Met with Brenice from Vrymansfontein. Interested in listing storage units. Follow up Friday. Cell 0821234567."
                  className="w-full rounded-xl border border-neutral-200 p-4 text-base"
                />
              ) : confirmDraft ? (
                <div className="space-y-4 text-sm">
                  <div className="rounded-xl border border-neutral-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-semibold">Organisation</span>
                      <ActionBadge
                        action={
                          confirmDraft.organisation.create ? "create" : "match"
                        }
                      />
                    </div>
                    <input
                      value={confirmDraft.organisation.name}
                      onChange={(e) =>
                        setConfirmDraft({
                          ...confirmDraft,
                          organisation: {
                            ...confirmDraft.organisation,
                            name: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-neutral-200 p-2 text-base"
                    />
                    <label className="mt-2 block text-neutral-600">
                      Pipeline stage
                    </label>
                    <select
                      value={
                        confirmDraft.organisation.pipeline_stage || "follow_up"
                      }
                      onChange={(e) =>
                        setConfirmDraft({
                          ...confirmDraft,
                          organisation: {
                            ...confirmDraft.organisation,
                            pipeline_stage: e.target.value as PipelineStage,
                          },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-200 p-2"
                    >
                      {PIPELINE_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {PIPELINE_STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <label className="mt-2 block text-neutral-600">Notes</label>
                    <textarea
                      value={confirmDraft.organisation.notes || ""}
                      onChange={(e) =>
                        setConfirmDraft({
                          ...confirmDraft,
                          organisation: {
                            ...confirmDraft.organisation,
                            notes: e.target.value || null,
                          },
                        })
                      }
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-neutral-200 p-2"
                    />
                  </div>

                  <div className="rounded-xl border border-neutral-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-semibold">Contact</span>
                      <ActionBadge
                        action={confirmDraft.contact.create ? "create" : "match"}
                      />
                    </div>
                    <input
                      value={confirmDraft.contact.full_name}
                      onChange={(e) =>
                        setConfirmDraft({
                          ...confirmDraft,
                          contact: {
                            ...confirmDraft.contact,
                            full_name: e.target.value,
                          },
                        })
                      }
                      className="mb-2 w-full rounded-lg border border-neutral-200 p-2"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={confirmDraft.contact.email || ""}
                      onChange={(e) =>
                        setConfirmDraft({
                          ...confirmDraft,
                          contact: {
                            ...confirmDraft.contact,
                            email: e.target.value || null,
                          },
                        })
                      }
                      className="mb-2 w-full rounded-lg border border-neutral-200 p-2"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={confirmDraft.contact.phone || ""}
                      onChange={(e) =>
                        setConfirmDraft({
                          ...confirmDraft,
                          contact: {
                            ...confirmDraft.contact,
                            phone: e.target.value || null,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-neutral-200 p-2"
                    />
                  </div>

                  <div className="rounded-xl border border-neutral-200 p-3">
                    <span className="font-semibold">Engagement</span>
                    <p className="mt-1 capitalize text-neutral-600">
                      {confirmDraft.engagement.type}
                    </p>
                    <textarea
                      value={confirmDraft.engagement.summary}
                      onChange={(e) =>
                        setConfirmDraft({
                          ...confirmDraft,
                          engagement: {
                            ...confirmDraft.engagement,
                            summary: e.target.value,
                          },
                        })
                      }
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-neutral-200 p-2"
                    />
                  </div>

                  {confirmDraft.followUp.title || confirmDraft.followUp.due_date ? (
                    <div className="rounded-xl border border-neutral-200 p-3">
                      <span className="font-semibold">Follow-up task</span>
                      <input
                        value={confirmDraft.followUp.title || ""}
                        onChange={(e) =>
                          setConfirmDraft({
                            ...confirmDraft,
                            followUp: {
                              ...confirmDraft.followUp,
                              create: Boolean(
                                e.target.value.trim() &&
                                  confirmDraft.followUp.due_date
                              ),
                              title: e.target.value || null,
                            },
                          })
                        }
                        className="mt-2 w-full rounded-lg border border-neutral-200 p-2"
                      />
                      <input
                        type="date"
                        value={confirmDraft.followUp.due_date || ""}
                        onChange={(e) =>
                          setConfirmDraft({
                            ...confirmDraft,
                            followUp: {
                              ...confirmDraft.followUp,
                              create: Boolean(
                                confirmDraft.followUp.title?.trim() &&
                                  e.target.value
                              ),
                              due_date: e.target.value || null,
                            },
                          })
                        }
                        className="mt-2 w-full rounded-lg border border-neutral-200 p-2"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            </div>

            <div className="flex shrink-0 gap-3 border-t border-neutral-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {step === "input" ? (
                <>
                  <button
                    type="button"
                    onClick={close}
                    className="min-h-[48px] flex-1 rounded-xl border border-neutral-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <div className="flex-1">
                    <PrimaryButton
                      onClick={analyse}
                      disabled={analysing || !text.trim()}
                    >
                      {analysing ? "Analysing…" : "Analyse"}
                    </PrimaryButton>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("input");
                      setError(null);
                    }}
                    className="min-h-[48px] flex-1 rounded-xl border border-neutral-200 font-semibold"
                  >
                    Back
                  </button>
                  <div className="flex-1">
                    <PrimaryButton onClick={confirmSave} disabled={saving}>
                      {saving ? "Saving…" : "Confirm & save"}
                    </PrimaryButton>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
