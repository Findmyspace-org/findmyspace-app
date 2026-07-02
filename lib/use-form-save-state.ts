"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type FormSaveVisualState = "saved" | "dirty" | "saving" | "error" | "idle";

type UseFormSaveStateOptions<T> = {
  serialize: (value: T) => string;
  current: T;
  enabled?: boolean;
};

export function useFormSaveState<T>({
  serialize,
  current,
  enabled = true,
}: UseFormSaveStateOptions<T>) {
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const isDirty = useMemo(() => {
    if (!enabled) return false;
    if (savedSnapshot === null) return false;
    return serialize(current) !== savedSnapshot;
  }, [current, enabled, savedSnapshot, serialize]);

  const establishBaseline = useCallback(
    (value?: T) => {
      const snapshot = serialize(value ?? currentRef.current);
      setSavedSnapshot(snapshot);
      setSaveError(null);
    },
    [serialize]
  );

  const markSaved = useCallback(
    (value?: T) => {
      const snapshot = serialize(value ?? currentRef.current);
      setSavedSnapshot(snapshot);
      setLastSavedAt(new Date());
      setSaveError(null);
    },
    [serialize]
  );

  const beginSave = useCallback(() => {
    setIsSaving(true);
    setSaveError(null);
  }, []);

  const finishSave = useCallback(
    (result: { ok: true; value?: T } | { ok: false; error: string }) => {
      setIsSaving(false);
      if (result.ok) {
        markSaved(result.value);
      } else {
        setSaveError(result.error);
      }
    },
    [markSaved]
  );

  const clearSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  const visualState: FormSaveVisualState = isSaving
    ? "saving"
    : saveError
      ? "error"
      : isDirty
        ? "dirty"
        : lastSavedAt
          ? "saved"
          : "idle";

  return {
    isDirty,
    isSaving,
    saveError,
    lastSavedAt,
    visualState,
    establishBaseline,
    markSaved,
    beginSave,
    finishSave,
    clearSaveError,
  };
}

export function formatLastSavedAt(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Saved just now";
  return `Last saved ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
