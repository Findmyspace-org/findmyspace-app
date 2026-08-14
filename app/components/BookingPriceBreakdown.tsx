import { bookingHasVisibleDiscount } from "@/lib/booking-discount";

type BookingPriceBreakdownProps = {
  originalAmount?: number | null;
  discountAmount?: number | null;
  finalAmount?: number | null;
  className?: string;
  /** Compact stacked lines; default matches dashboard cards. */
  size?: "sm" | "md";
};

function formatRand(amount: number): string {
  return `R${Number(amount || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function BookingPriceBreakdown({
  originalAmount,
  discountAmount,
  finalAmount,
  className = "",
  size = "sm",
}: BookingPriceBreakdownProps) {
  const final = Number(finalAmount || 0);
  const discount = Number(discountAmount || 0);
  const original =
    originalAmount == null ? final : Number(originalAmount || 0);

  if (!bookingHasVisibleDiscount(discount)) {
    return null;
  }

  const text = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className={`${text} text-[#192a3a] ${className}`.trim()}>
      <div className="flex justify-between gap-3">
        <span className="text-gray-600">Venue booking</span>
        <span className="tabular-nums">{formatRand(original)}</span>
      </div>
      <div className="flex justify-between gap-3 text-gray-700">
        <span>Discount</span>
        <span className="tabular-nums">−{formatRand(discount)}</span>
      </div>
      <div className="mt-1 flex justify-between gap-3 border-t border-gray-200 pt-1 font-semibold">
        <span>Total payable</span>
        <span className="tabular-nums">{formatRand(final)}</span>
      </div>
    </div>
  );
}
