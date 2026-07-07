"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Columns3, Table2 } from "lucide-react";

export type CrmPipelineView = "board" | "table";

export function CrmPipelineViewToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") as CrmPipelineView) || "board";

  function setView(next: CrmPipelineView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    if (next === "board") params.delete("page");
    router.push(`/admin/crm/pipeline?${params.toString()}`);
  }

  return (
    <div className="flex rounded-lg border border-gray-200 bg-white p-1">
      <button
        type="button"
        onClick={() => setView("board")}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
          view === "board" ? "bg-[#192a3a] text-white" : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <Columns3 className="h-4 w-4" /> Board
      </button>
      <button
        type="button"
        onClick={() => setView("table")}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
          view === "table" ? "bg-[#192a3a] text-white" : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <Table2 className="h-4 w-4" /> Table
      </button>
    </div>
  );
}

export function getCrmPipelineView(searchParams: URLSearchParams): CrmPipelineView {
  const view = searchParams.get("view");
  return view === "table" ? "table" : "board";
}
