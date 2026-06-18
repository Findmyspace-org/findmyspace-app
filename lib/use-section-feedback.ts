"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function sanitizeSectionMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "Something went wrong. Please try again.";
  if (
    trimmed.includes("<!DOCTYPE") ||
    trimmed.includes("__next_error__") ||
    /DOMMatrix|pdfjs|stack trace/i.test(trimmed)
  ) {
    return "Something went wrong. Please try again.";
  }
  return trimmed;
}

export function useSectionFeedback(autoClearMs = 5000) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const clearForAction = useCallback(() => {
    setStatus(null);
    setError(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const setSuccess = useCallback(
    (message: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setError(null);
      setStatus(message);
      timerRef.current = setTimeout(() => {
        setStatus(null);
        timerRef.current = null;
      }, autoClearMs);
    },
    [autoClearMs]
  );

  const setFailure = useCallback((message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setStatus(null);
    setError(sanitizeSectionMessage(message));
  }, []);

  return { status, error, setSuccess, setFailure, clearForAction };
}
