"use client";

import { AdminNav } from "@/app/components/AdminNav";
import { AdminCommercialTermsPanel } from "@/app/components/admin/AdminCommercialTermsPanel";

export default function AdminCommercialPage() {
  return (
    <main className="min-h-screen bg-[#f4f6f8] px-6 py-10 text-[#192a3a]">
      <AdminNav current="commercial" />
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">Commercial terms</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Platform-wide default for new bookings. Assign organisation, property, or
          space overrides from those admin screens. Existing paid bookings stay on
          the fees snapshotted when they were created.
        </p>
        <div className="mt-6">
          <AdminCommercialTermsPanel
            scopeType="platform"
            title="Platform default"
          />
        </div>
      </div>
    </main>
  );
}
