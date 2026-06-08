import { Users } from "lucide-react";

type UnclaimedListingEnquirySocialProofProps = {
  count: number;
};

export function UnclaimedListingEnquirySocialProof({
  count,
}: UnclaimedListingEnquirySocialProofProps) {
  if (count <= 0) return null;

  const label = count === 1 ? "enquiry" : "enquiries";

  return (
    <p className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950">
      <Users className="h-4 w-4 shrink-0 text-blue-700" aria-hidden />
      <span>
        This space has received{" "}
        <span className="font-semibold">
          {count} {label}
        </span>
      </span>
    </p>
  );
}
