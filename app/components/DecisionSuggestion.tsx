"use client";

import { AlertTriangle, CheckCircle2, Circle, Info, XCircle } from "lucide-react";

type DecisionSuggestionVariant = "success" | "warning" | "danger" | "info" | "neutral";
type DecisionSuggestionSize = "sm" | "md";

type DecisionSuggestionProps = {
  variant: DecisionSuggestionVariant;
  text: string;
  tooltip?: string;
  size?: DecisionSuggestionSize;
  /** When true, text wraps instead of truncating (for longer one-off guidance). */
  multiline?: boolean;
  className?: string;
};

const variantClasses: Record<DecisionSuggestionVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  neutral: "border-gray-200 bg-gray-50 text-gray-700",
};

const iconByVariant = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: Circle,
} as const;

const sizeClasses: Record<DecisionSuggestionSize, string> = {
  sm: "gap-1.5 px-2.5 py-1 text-[11px]",
  md: "gap-2 px-3 py-1.5 text-xs",
};

const iconSizeClasses: Record<DecisionSuggestionSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

export default function DecisionSuggestion({
  variant,
  text,
  tooltip,
  size = "sm",
  multiline,
  className,
}: DecisionSuggestionProps) {
  const VariantIcon = iconByVariant[variant];

  return (
    <div
      className={[
        "inline-flex rounded-md border leading-snug",
        multiline ? "items-start" : "items-center",
        variantClasses[variant],
        sizeClasses[size],
        className || "",
      ].join(" ")}
    >
      <VariantIcon className={`${iconSizeClasses[size]} shrink-0 ${multiline ? "mt-0.5" : ""}`} />
      <span className={multiline ? "min-w-0 text-left" : "truncate"}>{text}</span>
      {tooltip ? (
        <span
          title={tooltip}
          aria-label={tooltip}
          className="inline-flex items-center text-current/70"
        >
          <Info className={iconSizeClasses[size]} />
        </span>
      ) : null}
    </div>
  );
}
