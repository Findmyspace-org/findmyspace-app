"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { PrimaryButton } from "./SpacePlaceShell";

type EditSlideOverProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  success: string | null;
  children: React.ReactNode;
  formId?: string;
};

export function EditSlideOver({
  open,
  title,
  onClose,
  onSave,
  saving,
  error,
  success,
  children,
  formId,
}: EditSlideOverProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-slide-over-title"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-neutral-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 id="edit-slide-over-title" className="pr-10 text-xl font-bold">
            {title}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <div className="shrink-0 space-y-2 border-t border-neutral-200 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm font-medium text-emerald-700" role="status">
              {success}
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[48px] flex-1 rounded-xl border border-neutral-200 text-base font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              {formId ? (
                <PrimaryButton type="submit" form={formId} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={onSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </PrimaryButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
