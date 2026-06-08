"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { VenueScoutCaptureForm } from "@/app/components/VenueScoutCaptureForm";
import { useAdminRole } from "@/lib/use-admin-role";

export default function VenueScoutNewPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAdminRole();

  if (loading) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/admin/venue-scout"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to venue scout
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Scout new space</h1>
        <p className="mt-1 text-sm text-gray-600">
          Minimum details to get a venue on the map. Save, add photos, then publish.
        </p>
        <div className="mt-6">
          <VenueScoutCaptureForm
            mode="create"
            onCreated={(id) => router.replace(`/admin/venue-scout/${id}?saved=1`)}
          />
        </div>
      </div>
    </main>
  );
}
