import { PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/space-place/constants";

export function CrmPipelineBadge({ stage }: { stage: string | null | undefined }) {
  if (!stage) return <span className="text-gray-400">—</span>;
  const label =
    PIPELINE_STAGE_LABELS[stage as PipelineStage] ||
    stage.replace(/_/g, " ");
  const tone =
    stage === "closed_lost"
      ? "bg-gray-100 text-gray-700"
      : stage === "listed" || stage === "signed_up"
        ? "bg-emerald-50 text-emerald-800"
        : "bg-[#c1121f]/10 text-[#c1121f]";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

export function CrmListingStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      Listing: {status.replace(/_/g, " ")}
    </span>
  );
}

export function CrmOverdueBadge() {
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
      Overdue
    </span>
  );
}
