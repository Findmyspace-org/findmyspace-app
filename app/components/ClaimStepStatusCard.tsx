"use client";

import { CheckCircle2, Circle, Clock3, XCircle } from "lucide-react";

export type ClaimStepUiState =
  | "required"
  | "completed"
  | "pending_review"
  | "needs_attention";

const LABEL: Record<ClaimStepUiState, string> = {
  required: "Required",
  completed: "Completed",
  pending_review: "Pending review",
  needs_attention: "Needs attention",
};

const PILL: Record<ClaimStepUiState, string> = {
  required: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
  completed: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  pending_review: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  needs_attention: "border-[#fecaca] bg-[#fef2f2] text-[#9f1239]",
};

function Icon({ state }: { state: ClaimStepUiState }) {
  switch (state) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />;
    case "pending_review":
      return <Clock3 className="h-5 w-5 shrink-0 text-blue-600" />;
    case "needs_attention":
      return <XCircle className="h-5 w-5 shrink-0 text-red-600" />;
    default:
      return <Circle className="h-5 w-5 shrink-0 text-gray-400" />;
  }
}

export function ClaimStepStatusCard({
  title,
  description,
  state,
  action,
}: {
  title: string;
  description?: string;
  state: ClaimStepUiState;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <Icon state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-gray-900">{title}</p>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PILL[state]}`}
          >
            {LABEL[state]}
          </span>
        </div>
        {description ? (
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
