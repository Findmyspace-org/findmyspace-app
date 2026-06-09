import {
  UNCLAIMED_PRICING_HINT,
  UNCLAIMED_PRICING_LABEL,
} from "@/lib/listing-lifecycle";

type UnclaimedListingPricingSectionProps = {
  className?: string;
};

export function UnclaimedListingPricingSection({
  className = "rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.10)]",
}: UnclaimedListingPricingSectionProps) {
  return (
    <section className={className}>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
        Pricing
      </p>
      <p className="mt-2 text-2xl font-semibold text-[#192a3a]">
        {UNCLAIMED_PRICING_LABEL}
      </p>
      <p className="mt-2 text-sm text-gray-600">{UNCLAIMED_PRICING_HINT}</p>
    </section>
  );
}
