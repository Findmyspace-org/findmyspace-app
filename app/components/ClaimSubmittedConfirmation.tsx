"use client";

import Link from "next/link";

export function ClaimSubmittedConfirmation({
  spaceId,
  propertyId,
}: {
  spaceId: string;
  propertyId?: string | null;
}) {
  return (
    <section className="space-y-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-emerald-900">Submitted for review</h2>
        <p className="mt-2 text-sm leading-relaxed text-emerald-900/90">
          Your claim has been submitted. FindMySpace will review your identity
          documents and proof of ownership before unlocking listing editing.
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-900">What happens next</p>
        <ul className="mt-3 space-y-2 text-sm text-gray-600">
          <li className="flex gap-2">
            <span className="text-gray-400" aria-hidden>
              •
            </span>
            <span>We&apos;ll verify your identity.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-gray-400" aria-hidden>
              •
            </span>
            <span>We&apos;ll review your proof of ownership.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-gray-400" aria-hidden>
              •
            </span>
            <span>You&apos;ll be notified once your claim is approved.</span>
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-medium">Payout setup (optional for now)</p>
        <p className="mt-1 text-blue-800/90">
          You can complete bank details before approval, but payouts are only
          processed after your listing is live and bank verification is approved.
        </p>
        <Link
          href="/dashboard/verification?step=bank"
          className="mt-2 inline-flex text-sm font-semibold text-[#0f2740] underline"
        >
          Complete bank verification
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-emerald-100 pt-5">
        <Link
          href="/dashboard/owner"
          className="inline-flex rounded-lg bg-[#0f2740] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f2740]/90"
        >
          Back to host dashboard
        </Link>
        {propertyId ? (
          <Link
            href={`/dashboard/properties/${propertyId}`}
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#0f2740] hover:bg-gray-50"
          >
            View property
          </Link>
        ) : (
          <Link
            href="/dashboard/properties"
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#0f2740] hover:bg-gray-50"
          >
            My properties
          </Link>
        )}
        <Link
          href={`/spaces/${spaceId}`}
          className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#0f2740] hover:bg-gray-50"
        >
          View prepared listing
        </Link>
      </div>
    </section>
  );
}
