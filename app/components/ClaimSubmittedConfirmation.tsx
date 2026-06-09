"use client";

import Link from "next/link";

export function ClaimSubmittedConfirmation({ spaceId }: { spaceId: string }) {
  return (
    <section className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm leading-relaxed text-gray-700">
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

      <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-5">
        <Link
          href="/dashboard/listings"
          className="inline-flex rounded-lg bg-[#0f2740] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f2740]/90"
        >
          Back to my listings
        </Link>
        <Link
          href={`/spaces/${spaceId}`}
          className="inline-flex rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-[#0f2740] hover:bg-gray-50"
        >
          View prepared listing
        </Link>
      </div>
    </section>
  );
}
