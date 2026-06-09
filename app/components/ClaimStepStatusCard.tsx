"use client";

import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";

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
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />;
    case "pending_review":
      return <Clock3 className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />;
    case "needs_attention":
      return <AlertCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />;
    default:
      return (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-gray-300 bg-gray-50"
          aria-hidden
        />
      );
  }
}

export function ClaimStepStatusCard({
  title,
  description,
  state,
  statusLabel,
  action,
}: {
  title: string;
  description?: string;
  state: ClaimStepUiState;
  /** Override default pill label (e.g. custom awaiting-verification copy). */
  statusLabel?: string;
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
            {statusLabel ?? LABEL[state]}
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
