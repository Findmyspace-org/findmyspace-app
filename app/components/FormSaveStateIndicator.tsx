"use client";

import { Loader2 } from "lucide-react";
import { formatLastSavedAt } from "@/lib/use-form-save-state";

type FormSaveStateIndicatorProps = {
  isDirty: boolean;
  isSaving: boolean;
  saveError?: string | null;
  lastSavedAt?: Date | null;
  className?: string;
};

export function FormSaveStateIndicator({
  isDirty,
  isSaving,
  saveError,
  lastSavedAt,
  className = "",
}: FormSaveStateIndicatorProps) {
  if (isSaving) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 ${className}`}
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }

  if (saveError) {
    return (
      <span
        role="alert"
        className={`inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-900 ${className}`}
        title={saveError}
      >
        Save failed
      </span>
    );
  }

  if (isDirty) {
    return (
      <span
        role="status"
        className={`inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 ${className}`}
      >
        Unsaved changes
      </span>
    );
  }

  if (!lastSavedAt) {
    return (
      <span
        role="status"
        className={`inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 ${className}`}
      >
        No unsaved changes
      </span>
    );
  }

  return (
    <span
      role="status"
      className={`inline-flex flex-wrap items-center gap-x-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900 ${className}`}
    >
      <span>All changes saved</span>
      <span className="font-normal text-emerald-800/80">· {formatLastSavedAt(lastSavedAt)}</span>
    </span>
  );
}
