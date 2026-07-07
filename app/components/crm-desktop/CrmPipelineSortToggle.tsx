"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp, Sparkles } from "lucide-react";
import {
  getPipelineBoardSortMode,
  type CrmPipelineBoardSortMode,
} from "@/lib/crm-desktop/pipeline-ordering";

export function CrmPipelineSortToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sortMode = getPipelineBoardSortMode(searchParams.get("boardSort"));

  function setSortMode(next: CrmPipelineBoardSortMode) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "smart") params.delete("boardSort");
    else params.set("boardSort", next);
    router.push(`/admin/crm/pipeline?${params.toString()}`);
  }

  return (
    <div className="flex rounded-lg border border-gray-200 bg-white p-1">
      <button
        type="button"
        onClick={() => setSortMode("smart")}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
          sortMode === "smart"
            ? "bg-[#192a3a] text-white"
            : "text-gray-700 hover:bg-gray-50"
        }`}
        aria-pressed={sortMode === "smart"}
      >
        <Sparkles className="h-4 w-4" /> Smart priority
      </button>
      <button
        type="button"
        onClick={() => setSortMode("manual")}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
          sortMode === "manual"
            ? "bg-[#192a3a] text-white"
            : "text-gray-700 hover:bg-gray-50"
        }`}
        aria-pressed={sortMode === "manual"}
      >
        <ArrowDownUp className="h-4 w-4" /> Manual order
      </button>
    </div>
  );
}

export function getCrmPipelineBoardSortFromParams(
  searchParams: URLSearchParams
): CrmPipelineBoardSortMode {
  return getPipelineBoardSortMode(searchParams.get("boardSort"));
}
