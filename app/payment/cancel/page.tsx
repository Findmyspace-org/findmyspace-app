"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LayoutDashboard, XCircle } from "lucide-react";

function PaymentCancelContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("bookingId")?.trim() || null;

  const myBookingsHref = bookingId
    ? `/dashboard/my-bookings?payment=cancelled&bookingId=${encodeURIComponent(bookingId)}`
    : "/dashboard/my-bookings";

  return (
    <main className="min-h-screen bg-[#f8fafb] px-4 py-12 text-[#192a3a] sm:px-6">
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-200 bg-white p-8 shadow-sm">
          <div className="mb-5 flex justify-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200">
              <XCircle className="h-8 w-8" strokeWidth={2} aria-hidden />
            </span>
          </div>
          <h1 className="text-center text-2xl font-bold tracking-tight text-[#192a3a] sm:text-3xl">
            Payment not completed
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-gray-600">
            You left checkout before paying. Nothing has been charged. Your booking is
            still waiting for payment—you can try again whenever you&apos;re ready.
          </p>
          {bookingId && (
            <p className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center text-xs text-gray-600">
              <span className="font-medium text-gray-700">Booking:</span>{" "}
              <span className="font-mono text-[11px] text-gray-800">{bookingId}</span>
            </p>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href={myBookingsHref}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#192a3a] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              Back to My bookings
              <ArrowRight className="h-4 w-4 opacity-90" aria-hidden />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-[#192a3a] hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
          <p className="mt-6 text-center text-xs text-gray-500">
            Need help? Open the booking in My bookings and use Pay when you&apos;re ready to
            try again.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function PaymentCancelPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f8fafb] px-4 py-12 text-center text-sm text-gray-600 sm:px-6">
          Loading…
        </main>
      }
    >
      <PaymentCancelContent />
    </Suspense>
  );
}
