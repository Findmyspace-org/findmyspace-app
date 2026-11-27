"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type DiscountView = {
  originalAmount: number;
  discountAmount: number;
  payableAmount: number;
};

export default function BookingDiscountSummary({
  bookingId,
  preview,
}: {
  bookingId: string;
  preview?: DiscountView | null;
}) {
  const [discount, setDiscount] = useState<DiscountView | null>(preview ?? null);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const response = await fetch(`/api/bookings/${bookingId}/discount`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { discount?: DiscountView | null };
      if (!cancelled) setDiscount(payload.discount ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, preview]);

  if (!discount) return null;
  const money = (amount: number) =>
    `R${Number(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="space-y-1 text-sm text-[#192a3a]">
      <p>Original booking amount: {money(discount.originalAmount)}</p>
      <p>Host discount: {money(discount.discountAmount)}</p>
      <p className="font-medium">Amount payable: {money(discount.payableAmount)}</p>
    </div>
  );
}
