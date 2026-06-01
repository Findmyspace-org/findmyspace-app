"use client";

import { useEffect, useState } from "react";
import { Mic, X } from "lucide-react";
import { crmDb } from "@/lib/space-place/db";
import { useSpacePlace } from "../SpacePlaceContext";
import { PrimaryButton } from "./SpacePlaceShell";

export function QuickUpdateButton() {
  const { profile } = useSpacePlace();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function save() {
    if (!text.trim() || !profile) return;
    setSaving(true);
    setMessage(null);
    const { error } = await crmDb.inbox().insert({
      source: "manual_quick_update",
      raw_content: text.trim(),
      created_by: profile.id,
      processed: false,
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setText("");
    setMessage("Saved — we will parse this soon.");
    setTimeout(() => {
      setOpen(false);
      setMessage(null);
    }, 1200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[52px] items-center gap-2 rounded-full bg-[#c1121f] px-6 py-3 text-base font-bold text-white shadow-lg"
      >
        <Mic className="h-5 w-5" />
        QUICK UPDATE
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-update-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[min(90vh,calc(100dvh-6rem-env(safe-area-inset-bottom)))] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative shrink-0 border-b border-neutral-100 px-5 pb-3 pt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <h3 id="quick-update-title" className="pr-10 text-xl font-bold">
                Quick Update
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Capture a note in plain language. AI parsing comes later.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="I called Ilona from Drakenstein. Eda is available Tuesday at 10. Follow up Monday."
                className="w-full rounded-xl border border-neutral-200 p-4 text-base"
              />
              {message ? (
                <p className="mt-2 text-sm text-neutral-600">{message}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 gap-3 border-t border-neutral-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[48px] flex-1 rounded-xl border border-neutral-200 font-semibold"
              >
                Cancel
              </button>
              <div className="flex-1">
                <PrimaryButton onClick={save} disabled={saving || !text.trim()}>
                  {saving ? "Saving…" : "Save"}
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
