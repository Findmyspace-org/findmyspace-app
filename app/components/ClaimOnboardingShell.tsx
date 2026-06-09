"use client";

import Link from "next/link";
import { Check, Clock3 } from "lucide-react";

export type ClaimWizardStep =
  | "details"
  | "ownership"
  | "identity"
  | "submit";

export type ClaimStepProgress = "incomplete" | "complete" | "pending_review";

const STEPS: { key: ClaimWizardStep; label: string }[] = [
  { key: "details", label: "Claim details" },
  { key: "ownership", label: "Ownership proof" },
  { key: "identity", label: "Identity verification" },
  { key: "submit", label: "Submit for review" },
];

export function ClaimOnboardingShell({
  spaceId,
  listingTitle,
  currentStep,
  stepProgress,
  children,
}: {
  spaceId: string;
  listingTitle: string | null;
  currentStep: ClaimWizardStep;
  stepProgress: Partial<Record<ClaimWizardStep, ClaimStepProgress>>;
  children: React.ReactNode;
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0f2740]">
          Complete your claim
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">
          {listingTitle || "Your listing"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Prove you are authorised to manage this space. We&apos;ll review your
          claim before you can edit and activate the listing.
        </p>
      </div>

      <nav
        aria-label="Claim progress"
        className="mb-8 overflow-x-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <ol className="flex min-w-[520px] items-center gap-1">
          {STEPS.map((step, index) => {
            const progress = stepProgress[step.key] || "incomplete";
            const done =
              progress === "complete" ||
              progress === "pending_review" ||
              index < currentIndex;
            const active = step.key === currentStep;
            const pending =
              progress === "pending_review" && step.key === "submit";
            const href = `/dashboard/listings/${spaceId}/claim?step=${step.key}`;
            return (
              <li key={step.key} className="flex flex-1 items-center">
                <Link
                  href={href}
                  className={`flex w-full flex-col items-center gap-1 rounded-lg px-2 py-2 text-center transition ${
                    active
                      ? "bg-[#0f2740]/5 ring-1 ring-[#0f2740]/20"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      done
                        ? "bg-emerald-600 text-white"
                        : active
                          ? "bg-[#0f2740] text-white"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {done ? (
                      pending ? (
                        <Clock3 className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden />
                      )
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={`text-[11px] font-medium leading-tight ${
                      active ? "text-[#0f2740]" : "text-gray-600"
                    }`}
                  >
                    {step.label}
                  </span>
                </Link>
                {index < STEPS.length - 1 ? (
                  <span
                    className={`mx-1 hidden h-px flex-1 sm:block ${
                      done ? "bg-emerald-400" : "bg-gray-200"
                    }`}
                    aria-hidden
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      {children}

      <p className="mt-8 text-center text-xs text-gray-500">
        <Link href="/dashboard/listings" className="font-medium text-[#0f2740] hover:underline">
          Back to my listings
        </Link>
        {" · "}
        Listing editing unlocks after approval
      </p>
    </div>
  );
}
