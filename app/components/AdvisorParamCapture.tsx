"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { persistPendingAdvisorCodeFromUrl } from "@/lib/advisor-code";

/**
 * Reads `?advisor=CODE` on any page and stores it for signup / listing attribution.
 */
export default function AdvisorParamCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams.get("advisor");
    persistPendingAdvisorCodeFromUrl(raw);
  }, [searchParams]);

  return null;
}
