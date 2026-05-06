"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";

export type ListingFormStepMeta = {
  id: string;
  label: string;
  shortLabel: string;
};

type Props = {
  steps: ListingFormStepMeta[];
  currentStep: number;
  /** Furthest step the user has unlocked (can click to jump back). */
  maxUnlockedStep: number;
  onStepChange: (index: number) => void;
  /** Matches Browse Spaces primary chip red. */
  accentColor?: string;
};

/** Same as `app/spaces/page.tsx` selected filter chips. */
const BROWSE_PRIMARY = "#c1121f";

export default function ListingFormStepNav({
  steps,
  currentStep,
  maxUnlockedStep,
  onStepChange,
  accentColor = BROWSE_PRIMARY,
}: Props) {
  return (
    <div className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white/95 shadow-[0_4px_20px_rgba(15,23,42,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto max-w-6xl px-3 py-2 sm:px-6 sm:py-2.5">
        <div className="min-w-0 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] sm:overflow-visible">
          <div className="flex w-full min-w-max items-center sm:min-w-0 sm:max-w-full">
            {steps.map((step, i) => {
              const completed = i < currentStep;
              const current = i === currentStep;
              const clickable = i <= maxUnlockedStep;
              const lineFilled = i > 0 && i <= currentStep;

              return (
                <Fragment key={step.id}>
                  {i > 0 ? (
                    <div
                      className="mx-1.5 h-0.5 min-h-[2px] min-w-[12px] flex-1 basis-0 rounded-full transition-colors duration-300 sm:mx-2"
                      style={{
                        backgroundColor: lineFilled ? accentColor : "#e2e8f0",
                      }}
                      aria-hidden
                    />
                  ) : null}

                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onStepChange(i)}
                    className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-all duration-200 sm:h-10 sm:gap-2 sm:px-3.5 sm:text-xs ${
                      !clickable ? "cursor-not-allowed opacity-45" : "cursor-pointer active:scale-[0.98]"
                    } ${
                      completed
                        ? "border-emerald-400/80 bg-emerald-50 text-emerald-900 shadow-sm hover:border-emerald-500 hover:shadow-md"
                        : current
                          ? "border-transparent text-white shadow-sm hover:opacity-[0.96]"
                          : "border-[#d7dde3] bg-white text-[#334155] shadow-sm hover:border-[#b8c2cc] hover:shadow-md"
                    }`}
                    style={
                      current
                        ? {
                            backgroundColor: accentColor,
                            borderColor: accentColor,
                          }
                        : undefined
                    }
                    aria-current={current ? "step" : undefined}
                  >
                    {completed ? (
                      <Check className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <span className="shrink-0 tabular-nums">{i + 1}</span>
                    )}
                    <span className="max-w-[5rem] truncate sm:max-w-[9.5rem] sm:whitespace-nowrap">
                      <span className="sm:hidden">{step.shortLabel}</span>
                      <span className="hidden sm:inline">{step.label}</span>
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
