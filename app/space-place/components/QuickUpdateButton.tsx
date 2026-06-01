"use client";
import { crmDb } from "@/lib/space-place/db";

import { useState } from "react";
import { Mic } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSpacePlace } from "../SpacePlaceContext";
import { PrimaryButton } from "./SpacePlaceShell";

export function QuickUpdateButton() {
  const { profile } = useSpacePlace();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-xl font-bold">Quick Update</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Capture a note in plain language. AI parsing comes later.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="I called Ilona from Drakenstein. Eda is available Tuesday at 10. Follow up Monday."
              className="mt-4 w-full rounded-xl border border-neutral-200 p-4 text-base"
            />
            {message ? (
              <p className="mt-2 text-sm text-neutral-600">{message}</p>
            ) : null}
            <div className="mt-4 flex gap-3">
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
