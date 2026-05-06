import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import HostListingBookingQualityClient from "@/app/components/HostListingBookingQualityClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BookingQualityPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f8fafb] px-4 py-8 text-[#192a3a] sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                Host tools
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">Improve your booking quality</h1>
              <p className="mt-2 text-sm text-gray-600">Better information = better bookings.</p>
            </div>
            <Link
              href={`/spaces/${id}/edit`}
              className="inline-flex items-center justify-center rounded-xl border border-[#e2e8f0] bg-white px-4 py-2.5 text-sm font-medium text-[#192a3a] shadow-sm transition hover:bg-[#f8fafb]"
            >
              Back to edit listing
            </Link>
          </div>

          <HostListingBookingQualityClient spaceId={id} />
        </div>
      </main>
    </RequireAuth>
  );
}
