"use client";

import { Check } from "lucide-react";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/space-place/constants";
import {
  pipelineStepStatus,
  TRACKED_PIPELINE_STAGES,
} from "@/lib/space-place/pipeline-progress";

type Props = {
  currentStage: PipelineStage;
};

export function CrmPipelineProgress({ currentStage }: Props) {
  const isTerminal = currentStage === "closed_lost";

  return (
    <div className="space-y-3">
      <div className="-mx-1 overflow-x-auto pb-1">
        <ol className="flex min-w-max items-center gap-1 px-1">
          {TRACKED_PIPELINE_STAGES.map((stage, index) => {
            const status = pipelineStepStatus(stage, currentStage);
            const isLast = index === TRACKED_PIPELINE_STAGES.length - 1;
            return (
              <li key={stage} className="flex items-center gap-1">
                <div
                  className={`flex min-w-[7.5rem] flex-col items-center rounded-lg border px-2 py-2 text-center ${
                    status === "current"
                      ? "border-[#c1121f] bg-[#c1121f]/5 shadow-sm"
                      : status === "completed"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-gray-200 bg-white"
                  }`}
                >
                  <span
                    className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      status === "current"
                        ? "bg-[#c1121f] text-white"
                        : status === "completed"
                          ? "bg-emerald-600 text-white"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {status === "completed" ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    ) : status === "current" ? (
                      "●"
                    ) : (
                      "○"
                    )}
                  </span>
                  <span
                    className={`text-[11px] font-medium leading-tight ${
                      status === "current"
                        ? "text-[#c1121f]"
                        : status === "completed"
                          ? "text-emerald-800"
                          : "text-gray-500"
                    }`}
                  >
                    {PIPELINE_STAGE_LABELS[stage]}
                  </span>
                </div>
                {!isLast ? (
                  <div
                    className={`h-0.5 w-4 shrink-0 ${
                      status === "completed" ? "bg-emerald-400" : "bg-gray-200"
                    }`}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      {isTerminal ? (
        <p className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Current status:{" "}
          <span className="font-semibold">
            {PIPELINE_STAGE_LABELS.closed_lost}
          </span>
        </p>
      ) : null}
    </div>
  );
}
