"use client";

import Link from "next/link";
import { Check, Circle, Clock3, AlertTriangle, Info } from "lucide-react";
import type { OwnerSpaceStep, OwnerSpaceStepState } from "@/lib/owner-property-space-steps";

function stepIcon(state: OwnerSpaceStepState) {
  switch (state) {
    case "completed":
      return <Check className="h-3.5 w-3.5" aria-hidden />;
    case "pending_review":
      return <Clock3 className="h-3.5 w-3.5" aria-hidden />;
    case "needs_attention":
      return <AlertTriangle className="h-3.5 w-3.5" aria-hidden />;
    case "info":
      return <Info className="h-3.5 w-3.5" aria-hidden />;
    case "required":
      return <Circle className="h-3 w-3" aria-hidden />;
    default:
      return <Circle className="h-3 w-3 opacity-40" aria-hidden />;
  }
}

function stepPillClass(state: OwnerSpaceStepState): string {
  switch (state) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "required":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "pending_review":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "needs_attention":
      return "border-red-200 bg-red-50 text-red-800";
    case "info":
      return "border-violet-200 bg-violet-50 text-violet-800";
    default:
      return "border-gray-200 bg-gray-50 text-gray-500";
  }
}

function stepLabel(state: OwnerSpaceStepState): string {
  switch (state) {
    case "completed":
      return "Completed";
    case "required":
      return "Required";
    case "pending_review":
      return "Pending review";
    case "needs_attention":
      return "Needs attention";
    case "info":
      return "Info";
    default:
      return "Upcoming";
  }
}

export function OwnerPropertySpaceSteps({ steps }: { steps: OwnerSpaceStep[] }) {
  return (
    <ol className="mt-4 space-y-2">
      {steps.map((step) => {
        const clickable =
          Boolean(step.href) &&
          (step.state === "required" || step.state === "needs_attention");
        const content = (
          <div
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${stepPillClass(step.state)} ${
              clickable ? "transition hover:shadow-sm" : ""
            }`}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70">
              {stepIcon(step.state)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{step.label}</span>
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {stepLabel(step.state)}
                </span>
              </div>
              {step.detail ? (
                <p className="mt-0.5 text-xs opacity-90">{step.detail}</p>
              ) : null}
            </div>
          </div>
        );

        return (
          <li key={step.id}>
            {clickable && step.href ? (
              <Link href={step.href} className="block">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}
